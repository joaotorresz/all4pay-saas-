"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import { analisarImportacao } from "@/core/fdip";
import { ocrLocalImagem, ocrLocalPdf } from "@/lib/ocr-local";
import { aplicarOnboarding } from "@/lib/fdip";
import { listParties } from "@/lib/cadastros";
import { getOpenMovements } from "@/lib/data";
import { analisarDocumento, confirmarDocumento, type DocFields } from "@/lib/upload-doc";
import type { FDIPReport } from "@/core/fdip/types";
import type { Party, Movement } from "@/lib/types";
import {
  DEMO_INBOX, INBOX_CANAIS, STATUS_META, ABAS, abaDe,
  type InboxDoc, type DocStatus, type AbaId,
} from "@/lib/inbox";

const EMAIL = "financeiro@suaempresa.all4pay.com";

/** Atualizações que um documento confirmado propaga pelo ecossistema. */
const ECOSSISTEMA = [
  "Contas a pagar", "Contas a receber", "Fluxo de caixa", "DRE", "Tesouraria",
  "Forecast", "Runway", "Burn", "Dashboard", "IA", "Auditoria", "Eventos",
  "Calendário financeiro", "Aprovações", "Recorrências", "Contatos",
  "Centros de custo", "Benchmark", "Feature Store",
];

const tipoFromName = (name: string): string => {
  const n = name.toLowerCase();
  if (n.endsWith(".ofx")) return "Extrato OFX";
  if (n.endsWith(".csv") || n.endsWith(".xlsx") || n.endsWith(".xls")) return "Planilha";
  if (n.endsWith(".xml")) return "NF-e / XML";
  if (n.match(/\.(png|jpg|jpeg)$/)) return "Imagem / comprovante";
  if (n.endsWith(".pdf")) return "PDF";
  return "Documento";
};

const confColor = (c: number) => (c >= 0.95 ? "var(--color-positive)" : c >= 0.85 ? "var(--color-warning)" : "var(--color-negative)");

export function InboxView() {
  const { show, node } = useToast();
  const qc = useQueryClient();
  const [docs, setDocs] = React.useState<InboxDoc[]>(DEMO_INBOX);
  const [selId, setSelId] = React.useState<string>(DEMO_INBOX[0]?.id ?? "");
  const [drag, setDrag] = React.useState(false);
  const [gravando, setGravando] = React.useState(false);
  const [aba, setAba] = React.useState<AbaId>("pendentes");
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Payload por documento p/ a confirmação gravar de verdade: extrato (FDIP) ou
  // campos extraídos (OCR). Demo seed cai no fieldsFromDoc.
  const payloadRef = React.useRef(new Map<string, { report?: FDIPReport; fields?: DocFields }>());

  const [ocrOn, setOcrOn] = React.useState<boolean | null>(null);

  const sel = docs.find((d) => d.id === selId) ?? docs[0];
  const abaDocs = docs.filter((d) => abaDe(d.status) === aba);

  React.useEffect(() => {
    fetch("/api/inbox/ocr").then((r) => r.json()).then((j) => setOcrOn(!!j.configured)).catch(() => setOcrOn(false));
  }, []);

  const ingerir = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const f of arr) {
      const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const today = new Date().toISOString().slice(0, 10);
      const isText = /\.(ofx|csv|txt)$/i.test(f.name);
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      const isImg = /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);
      let doc: InboxDoc | null = null;

      try {
        if (isText) {
          // Extratos OFX/CSV → motor FDIP (já roda hoje).
          const rep = analisarImportacao(await f.text());
          const valor = rep.records.reduce((s, r) => s + Math.abs(r.valor), 0);
          doc = {
            id, tipo: tipoFromName(f.name), canal: "Upload", beneficiario: f.name,
            valor, data: today, status: "pronto", confianca: 0.9, acao: "Revisar lançamentos",
            acaoTipo: "a_pagar",
            crossCheck: `${rep.records.length} lançamentos lidos · ${rep.entidades.length} contrapartes · ${rep.plano.categorias.length} categorias detectadas.`,
            matriz: [{ campo: "Documento", confianca: 0.95 }, { campo: "Lançamentos", confianca: 0.9 }],
          };
          payloadRef.current.set(id, { report: rep }); // confirmar → aplicarOnboarding
        } else if ((isImg || isPdf) && ocrOn) {
          // OCR real via visão do Claude (Anthropic).
          const { data, mediaType } = await lerArquivo(f, isImg && !isPdf);
          const r = await fetch("/api/inbox/ocr", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileBase64: data, mediaType: isPdf ? "application/pdf" : mediaType }),
          }).then((x) => x.json());
          if (r.ok && r.doc) {
            const ex = r.doc as Record<string, unknown>;
            const conf = typeof ex.confianca === "number" ? ex.confianca : 0.8;
            doc = {
              id, tipo: (ex.tipo as string) || tipoFromName(f.name), canal: "OCR · documento",
              beneficiario: (ex.beneficiario as string) || (ex.pagador as string) || f.name,
              valor: Number(ex.valor) || 0, data: (ex.data as string) || today,
              vencimento: (ex.vencimento as string) || undefined,
              status: conf >= 0.9 ? "pronto" : "revisao", confianca: conf,
              acao: (ex.acao as string) || "Revisar e classificar",
              acaoTipo: (ex.acaoTipo as InboxDoc["acaoTipo"]) || "a_pagar",
              categoria: (ex.categoria as string) || undefined,
              crossCheck: crossDe(ex),
              matriz: Array.isArray(ex.campos) && ex.campos.length
                ? (ex.campos as { campo: string; confianca: number }[]).map((c) => ({ campo: c.campo, confianca: c.confianca }))
                : [{ campo: "Documento", confianca: conf }],
            };
            payloadRef.current.set(id, { fields: fieldsFromEx(ex, conf) });
          } else {
            doc = placeholder(id, f, today, `OCR não concluiu: ${r.reason ?? "erro"}.`);
          }
        } else if (isImg || isPdf) {
          // Sem chave da Anthropic → OCR LOCAL no navegador (Tesseract.js, grátis).
          // PDF é rasterizado (pdf.js) para PNG antes de ler. Entra como revisão.
          show(isPdf ? "Convertendo o PDF e lendo no navegador (OCR local)…" : "Lendo o documento no navegador (OCR local)…");
          const ex = isPdf ? await ocrLocalPdf(f) : await ocrLocalImagem(f);
          doc = {
            id, tipo: ex.tipo, canal: isPdf ? "OCR local · PDF" : "OCR local · navegador",
            beneficiario: ex.beneficiario || f.name,
            valor: ex.valor || 0, data: ex.data || today,
            vencimento: ex.vencimento || undefined,
            status: "revisao", confianca: ex.confianca,
            acao: ex.acao || "Revisar e classificar",
            acaoTipo: ex.acaoTipo || "a_pagar",
            categoria: ex.categoria || undefined,
            crossCheck: crossLocal(ex),
            matriz: ex.campos.length
              ? ex.campos.map((c) => ({ campo: c.campo, confianca: c.confianca }))
              : [{ campo: "Documento", confianca: ex.confianca }],
          };
          payloadRef.current.set(id, { fields: ex as unknown as DocFields });
        }
      } catch { /* cai no placeholder */ }

      if (!doc) {
        const motivo = (isImg || isPdf)
          ? "Não consegui ler automaticamente — classifique manualmente, ou envie o extrato em OFX/CSV."
          : "Recebido — classifique manualmente.";
        doc = placeholder(id, f, today, motivo);
      }
      setDocs((d) => [doc as InboxDoc, ...d]);
      setSelId(id);
      setAba(abaDe((doc as InboxDoc).status));
    }
    show(`${arr.length} documento(s) na caixa de entrada`);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files?.length) ingerir(e.dataTransfer.files);
  };

  const confirmar = async (d: InboxDoc) => {
    setGravando(true);
    try {
      const p = payloadRef.current.get(d.id);
      if (p?.report) {
        // Extrato OFX/CSV → onboarding (cria entidades/categorias/lançamentos).
        await aplicarOnboarding(p.report);
      } else {
        // Documento (boleto/comprovante/nota) → análise + gravação do lançamento,
        // com cross-check do beneficiário e baixa de agendado.
        const fields = p?.fields ?? fieldsFromDoc(d);
        const [parties, aPagar, aReceber] = await Promise.all([
          listParties().catch(() => [] as Party[]),
          getOpenMovements("saida").catch(() => [] as Movement[]),
          getOpenMovements("entrada").catch(() => [] as Movement[]),
        ]);
        const analise = analisarDocumento(fields, parties, [...aPagar, ...aReceber]);
        await confirmarDocumento({ analise, criarContato: !!d.novoBeneficiario });
      }
      await qc.invalidateQueries();
      setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, status: "lancado" } : x)));
      setAba("lancados");
      show("Lançado — virou movimento de saída e reflete em /pagaveis, fluxo, DRE, risco e dashboard");
    } catch {
      show("Não consegui lançar este documento — revise os campos e tente de novo");
    } finally {
      setGravando(false);
    }
  };

  const arquivar = (d: InboxDoc) => {
    setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, status: "arquivado" } : x)));
    show("Documento arquivado");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Canais de entrada */}
      <Card className="lg:col-span-3 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="inbox" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="inline-flex items-center gap-1 text-label font-medium text-muted">Canais de entrada — tudo cai aqui, como um e-mail<InfoHint align="left" titulo="Canais de entrada" oQue="Reúne num só lugar tudo que chega: documentos, extratos, notas, boletos e comprovantes." comoCalcula="Você arrasta arquivos ou usa os conectores (e-mail, WhatsApp, Open Finance, OCR); extratos OFX e CSV já entram pelo onboarding inteligente." /></span>
          <span className="ml-auto inline-flex items-center gap-2 text-caption text-muted bg-surface-2 rounded-pill px-3 py-1">
            <Icon name="mail" size={13} color="var(--color-text-secondary)" />
            {EMAIL}
          </span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-card border border-dashed p-6 text-center cursor-pointer transition-colors ${drag ? "border-lime bg-lime-tint" : "border-border hover:border-ink/30"}`}
        >
          <Icon name="upload" size={22} color="var(--color-text-secondary)" />
          <p className="m-0 mt-2 text-[15px] text-ink">Arraste documentos aqui ou clique para enviar</p>
          <p className="m-0 text-caption text-faint">PDF · PNG · JPG · OFX · Excel · CSV · XML · DANFE · NFS-e · boleto · comprovante</p>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.target.files && ingerir(e.target.files)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {INBOX_CANAIS.map((c) => {
            const isOcr = c.icon === "scan-line";
            // OCR está sempre ativo: visão do Claude com a chave, ou local (Tesseract) sem ela.
            const pronto = isOcr ? true : c.pronto;
            const rotuloOcr = ocrOn === true ? "ativo · IA (Claude)" : "ativo · local (sem chave)";
            return (
              <div key={c.titulo} className="rounded-md border border-border-soft p-3 flex flex-col gap-1">
                <Icon name={c.icon} size={16} color="var(--color-text-secondary)" />
                <span className="text-[13px] font-medium text-ink">{c.titulo}</span>
                <span className="text-caption text-faint leading-[1.35]">{c.desc}</span>
                {pronto
                  ? <span className="text-caption text-positive mt-[2px]">{isOcr ? rotuloOcr : "ativo"}</span>
                  : <span className="text-caption text-faint mt-[2px]">em breve</span>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Fila — abas + colunas */}
      <Card padded={false} className="lg:col-span-3">
        {/* Abas */}
        <div className="flex items-center gap-1 px-5 pt-[14px] border-b border-border-soft">
          {ABAS.map((a) => {
            const n = docs.filter((d) => abaDe(d.status) === a.id).length;
            const on = aba === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`relative inline-flex items-center gap-2 px-3 py-2 text-caption transition-colors ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
              >
                {a.label}
                <span className="text-[12px] tabular-nums text-faint bg-surface-2 rounded-pill px-[6px]">{n}</span>
                {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
              </button>
            );
          })}
        </div>
        {/* Cabeçalho de colunas */}
        <div className="hidden md:grid grid-cols-[1.6fr_0.9fr_0.9fr_1.1fr_0.9fr_1fr_60px] gap-3 px-5 py-2 text-caption text-faint border-b border-border-soft">
          <span>Beneficiário</span><span>Vencimento</span><span className="text-right">Valor a pagar</span>
          <span>Classificação</span><span>Origem</span><span>Situação</span><span className="text-right">Anexos</span>
        </div>
        {/* Linhas */}
        <div className="flex flex-col max-h-[460px] overflow-y-auto">
          {abaDocs.length === 0 ? (
            <p className="text-caption text-faint text-center py-8">Nenhum documento nesta aba.</p>
          ) : abaDocs.map((d) => {
            const st = STATUS_META[d.status];
            const on = d.id === sel?.id;
            return (
              <button
                key={d.id}
                onClick={() => setSelId(d.id)}
                className={`grid grid-cols-[1.6fr_0.9fr_0.9fr_1.1fr_0.9fr_1fr_60px] gap-3 items-center px-5 py-3 text-left border-t border-border-soft first:border-t-0 ${on ? "bg-surface-2" : "hover:bg-surface-1"}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: st.dot }} />
                  <span className="text-[14px] text-ink truncate">{d.beneficiario}</span>
                </span>
                <span className="text-caption text-muted tabular-nums">{d.vencimento ? fmt(d.vencimento) : "—"}</span>
                <span className="text-caption text-ink tabular-nums text-right">{d.valor > 0 ? <BRL value={d.valor} /> : "—"}</span>
                <span className="text-caption text-muted truncate">{d.categoria ?? d.tipo}</span>
                <span className="text-caption text-faint truncate">{d.canal}</span>
                <span className="text-caption text-muted truncate">{st.label}</span>
                <span className="text-caption text-faint tabular-nums text-right inline-flex items-center justify-end gap-1"><Icon name="paperclip" size={12} color="var(--color-text-tertiary)" />1</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Workbench do documento selecionado */}
      {sel && (
        <Card className="lg:col-span-3 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Icon name="paperclip" size={15} color="var(--color-text-secondary)" />
              <span className="text-h3 font-medium text-ink">{sel.beneficiario}</span>
              <span className="text-caption text-muted bg-surface-2 rounded-pill px-2 py-[1px]">{sel.tipo}</span>
              <InfoHint align="left" titulo="Documento" oQue="Mostra os campos que a IA extraiu do documento e deixa revisar antes de lançar." comoCalcula="O OCR lê valor, vencimento e beneficiário, faz o cross-check com os contatos e mede a confiança de cada campo." />
            </div>
            <span className="inline-flex items-center gap-1 text-caption font-medium" style={{ color: confColor(sel.confianca) }}>
              confiança {Math.round(sel.confianca * 100)}%
            </span>
          </div>

          {/* Campos extraídos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <Campo label="Valor" value={sel.valor > 0 ? formatBRL(sel.valor) : "—"} />
            <Campo label="Recebido" value={fmt(sel.data)} />
            {sel.vencimento && <Campo label="Vencimento" value={fmt(sel.vencimento)} />}
            <Campo label="Ação detectada" value={sel.acao} />
            {sel.categoria && <Campo label="Categoria" value={sel.categoria} />}
            {sel.centroCusto && <Campo label="Centro de custo" value={sel.centroCusto} />}
            {sel.recorrencia && <Campo label="Recorrência" value={sel.recorrencia} />}
            {sel.conta && <Campo label="Conta" value={sel.conta} />}
          </div>

          {/* Cross-check inteligente */}
          {sel.crossCheck && (
            <div className="rounded-md p-3 flex items-start gap-2" style={{ background: "var(--color-surface-2)" }}>
              <Icon name="sparkles" size={15} color="var(--color-text-secondary)" className="mt-[2px]" />
              <span className="text-caption text-muted leading-[1.5]">{sel.crossCheck}</span>
            </div>
          )}

          {/* Beneficiário novo → sugestões */}
          {sel.novoBeneficiario && (
            <div className="flex flex-wrap gap-2">
              {["Criar fornecedor", "Criar categoria", "Criar recorrência"].map((s) => (
                <button key={s} onClick={() => show(`${s} — sugerido pela IA`)} className="text-caption font-medium text-ink bg-surface-2 rounded-pill px-3 py-1 hover:bg-surface-3">
                  + {s}
                </button>
              ))}
            </div>
          )}

          {/* Matriz de confiança */}
          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-faint tracking-wide">Matriz de confiança — campos ≥ 95% podem aprovar sozinhos</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-[6px]">
              {sel.matriz.map((m) => (
                <div key={m.campo} className="flex items-center gap-3">
                  <span className="text-caption text-muted w-[130px] truncate">{m.campo}</span>
                  <div className="flex-1 h-[6px] rounded-pill bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-pill" style={{ width: `${m.confianca * 100}%`, background: confColor(m.confianca) }} />
                  </div>
                  <span className="text-caption tabular-nums w-[38px] text-right" style={{ color: confColor(m.confianca) }}>{Math.round(m.confianca * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-3 flex-wrap">
            <span className="text-caption text-faint">Ao lançar, vira <b className="text-muted font-medium">movimento de saída</b> no hub e reflete em /pagaveis, fluxo, DRE, risco e dashboard.</span>
            <div className="flex items-center gap-2 flex-wrap">
              {abaDe(sel.status) === "lancados" ? (
                <>
                  <span className="inline-flex items-center gap-1 text-caption font-medium text-positive"><Icon name="check" size={14} color="var(--color-positive)" /> Lançado</span>
                  <span className="text-caption text-faint bg-surface-2 rounded-pill px-3 py-1 cursor-not-allowed opacity-60" title="Em breve">Pagar via Pix</span>
                  <span className="text-caption text-faint bg-surface-2 rounded-pill px-3 py-1 cursor-not-allowed opacity-60" title="Em breve">Agendar</span>
                </>
              ) : sel.status === "arquivado" ? (
                <span className="inline-flex items-center gap-1 text-caption text-faint"><Icon name="check" size={14} color="var(--color-text-tertiary)" /> Arquivado</span>
              ) : (
                <>
                  <button onClick={() => arquivar(sel)} className="text-caption font-medium text-muted hover:text-ink bg-surface-2 rounded-pill px-3 py-[7px]">Arquivar</button>
                  <Button variant="primary" size="sm" disabled={gravando} onClick={() => confirmar(sel)}>{gravando ? "Lançando…" : "Lançar"}</Button>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Digital Twin */}
      <Card className="lg:col-span-3 flex flex-col gap-2" elevated={false} style={{ background: "var(--color-surface-2)" }} info={{ titulo: "Financial Digital Twin", oQue: "Mantém um modelo vivo das obrigações da empresa para interpretar cada documento novo.", comoCalcula: "Aprende os compromissos recorrentes e compara cada documento com esse padrão, sugerindo a ação certa." }}>
        <div className="flex items-center gap-2">
          <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center">
            <Icon name="cpu" size={14} color="var(--color-on-lime)" />
          </span>
          <span className="text-label font-medium text-muted">Financial Digital Twin</span>
        </div>
        <p className="m-0 text-body text-ink leading-[1.5] max-w-[90ch]">
          A IA mantém um <b className="font-medium">gêmeo digital</b> das obrigações da empresa — aprende que todo dia 10 chega a internet,
          dia 5 a folha, dia 20 o fornecedor X. Quando um documento novo chega, ela compara com esse modelo vivo e conclui, por exemplo:
        </p>
        <p className="m-0 text-caption text-muted leading-[1.6] max-w-[90ch] border-l-2 border-border pl-3">
          “Este boleto corresponde à internet recorrente da unidade Campinas. Está 22% acima da média de 12 meses, há orçamento disponível,
          o fornecedor está cadastrado e há saldo na conta BTG. Posso criar o compromisso, agendar o pagamento na data ótima de caixa,
          atualizar o fluxo projetado e registrar a obrigação na DRE.”
        </p>
        <span className="text-caption text-faint">OCR, e-mail, WhatsApp e Open Finance são conectores de ingestão que plugam nesta mesma esteira — o upload de extratos (OFX/CSV) já roda hoje pelo motor de onboarding inteligente.</span>
      </Card>

      {node}
    </div>
  );
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[15px] text-ink">{value}</span>
    </div>
  );
}

function fmt(iso: string): string {
  if (!iso || !iso.includes("-")) return iso || "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** Lê o arquivo em base64; reduz imagens (max 1600px, JPEG) p/ caber no POST. */
async function lerArquivo(file: File, downscale: boolean): Promise<{ data: string; mediaType: string }> {
  if (downscale) {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d")?.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      return { data: c.toDataURL("image/jpeg", 0.82), mediaType: "image/jpeg" };
    } catch { /* cai no FileReader */ }
  }
  const data: string = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
  });
  return { data, mediaType: file.type || "application/octet-stream" };
}

/** DocFields a partir do retorno do OCR por IA (Claude). */
function fieldsFromEx(ex: Record<string, unknown>, conf: number): DocFields {
  return {
    tipo: (ex.tipo as string) || "Documento",
    beneficiario: (ex.beneficiario as string) ?? null,
    pagador: (ex.pagador as string) ?? null,
    valor: ex.valor != null ? Number(ex.valor) : null,
    data: (ex.data as string) ?? null,
    vencimento: (ex.vencimento as string) ?? null,
    cnpj: (ex.cnpj as string) ?? null,
    cpf: (ex.cpf as string) ?? null,
    acaoTipo: (ex.acaoTipo as DocFields["acaoTipo"]) ?? null,
    acao: (ex.acao as string) ?? null,
    categoria: (ex.categoria as string) ?? null,
    confianca: conf,
  };
}

/** DocFields a partir de um InboxDoc (demo seed / sem payload). */
function fieldsFromDoc(d: InboxDoc): DocFields {
  return {
    tipo: d.tipo, beneficiario: d.beneficiario, pagador: null,
    valor: d.valor, data: d.data, vencimento: d.vencimento ?? null,
    cnpj: null, cpf: null, acaoTipo: d.acaoTipo, acao: d.acao,
    categoria: d.categoria ?? null, confianca: d.confianca,
  };
}

/** Cross-check do OCR local (Tesseract) — sinaliza a menor precisão + o que leu. */
function crossLocal(ex: import("@/lib/ocr-local").DocExtraido): string {
  const partes: string[] = [];
  if (ex.cnpj) partes.push(`CNPJ ${ex.cnpj}`);
  if (ex.cpf) partes.push(`CPF ${ex.cpf}`);
  if (ex.chavePix) partes.push(`PIX ${ex.chavePix}`);
  if (ex.linhaDigitavel) partes.push("linha digitável lida");
  if (ex.banco) partes.push(ex.banco);
  const lido = partes.length ? ` Leu: ${partes.join(" · ")}.` : "";
  return `Lido localmente no navegador (Tesseract, sem chave) — precisão menor, revise os campos antes de confirmar.${lido}`;
}

/** Monta o cross-check a partir dos campos extraídos pela IA. */
function crossDe(ex: Record<string, unknown>): string {
  const partes: string[] = [];
  if (ex.cnpj) partes.push(`CNPJ ${ex.cnpj}`);
  if (ex.cpf) partes.push(`CPF ${ex.cpf}`);
  if (ex.chavePix) partes.push(`PIX ${ex.chavePix}`);
  if (ex.linhaDigitavel) partes.push("linha digitável lida");
  else if (ex.codigoBarras) partes.push("código de barras lido");
  if (ex.banco) partes.push(String(ex.banco));
  return partes.length ? `Extraído pela IA · ${partes.join(" · ")}.` : "Documento lido pela IA — revise os campos.";
}

function placeholder(id: string, f: File, today: string, motivo: string): InboxDoc {
  return {
    id, tipo: tipoFromName(f.name), canal: "Upload", beneficiario: f.name,
    valor: 0, data: today, status: "analise", confianca: 0.5,
    acao: "Revisar e classificar", acaoTipo: "a_pagar", crossCheck: motivo,
    matriz: [{ campo: "Documento", confianca: 0.9 }, { campo: "Ação financeira", confianca: 0.5 }],
  };
}
