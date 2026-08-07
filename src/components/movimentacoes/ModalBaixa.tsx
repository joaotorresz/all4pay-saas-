"use client";

/**
 * BAIXA NA PRÓPRIA LINHA — clicar num título → confirmar → anexar comprovante.
 *
 * ⚠️ PORTE do extrato para a tela canônica de títulos (mapa de consolidação,
 * item 2). A canônica só tinha baixa EM LOTE, que exige marcar caixinhas: para
 * dar baixa em UM título — o caso mais comum, de longe — o lote é o caminho
 * mais longo que existe.
 *
 * ⚠️ Vai por `createPortal` no `<body>`. O `Card` do DS tem `transform` (a
 * micro-elevação), e um ancestral transformado vira o bloco de contenção de
 * qualquer `position: fixed` — sem o portal o modal nasce do tamanho do card e
 * cai centrado fora da dobra.
 *
 * Extraído em vez de duplicado: a operação move DINHEIRO, e duas cópias
 * divergirem aqui significa dois comportamentos de liquidação diferentes.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Icon, Button, Select } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { anexarComprovante, type MetodoPagamento } from "@/lib/pagamentos";
import { vincularProjeto } from "@/lib/projeto-vinculo";
import type { RiskMovement } from "@/core/risk-engine/types";

export function ModalBaixa({
  baixa, ehSaida, partyNames, contas, projetos,
  projeto, onProjeto, onProjetoMudou,
  conta, setConta, metodo, setMetodo,
  comprovante, setComprovante, enviando,
  onConfirmar, onFechar, show,
}: {
  baixa: RiskMovement;
  ehSaida: boolean;
  partyNames?: Record<string, string>;
  contas: { id: string; name: string }[];
  projetos: { id: string; nome: string }[];
  projeto: string;
  onProjeto: (v: string) => void;
  onProjetoMudou?: () => void;
  conta: string;
  setConta: (v: string) => void;
  metodo: MetodoPagamento;
  setMetodo: (v: MetodoPagamento) => void;
  comprovante: string | null;
  setComprovante: (v: string | null) => void;
  enviando: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
  show: (m: string) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  if (typeof document === "undefined") return null;
  return createPortal(
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={() => onFechar()}>
          <div className="w-full max-w-[440px] bg-white rounded-card p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-h3 font-medium text-ink">
                {baixa.status === "pago"
                  ? (ehSaida ? "Pagamento realizado" : "Recebimento realizado")
                  : (ehSaida ? "Confirmar pagamento" : "Confirmar recebimento")}
              </span>
              <button onClick={() => onFechar()} aria-label="Fechar" className="w-8 h-8 rounded-pill inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2">
                <Icon name="x" size={16} color="currentColor" />
              </button>
            </div>

            <div className="flex flex-col gap-1 rounded-md bg-surface-1 p-3">
              <Linha label={ehSaida ? "Beneficiário" : "Pagador"} value={(baixa.party_id && partyNames?.[baixa.party_id]) || baixa.category || "—"} />
              <Linha label="Vencimento" value={baixa.due_date.slice(0, 10).split("-").reverse().join("/")} />
              {baixa.category && <Linha label="Categoria" value={baixa.category} />}
              <Linha label="Valor" value={formatBRL(baixa.amount)} forte />
            </div>

            {/* Projeto do lançamento — é este vínculo que faz o filtro "Projeto"
                da DRE/DFC e dos painéis filtrar de verdade. Fica aqui porque é
                onde se olha uma transação e se pergunta "de que campanha é?". */}
            {projetos.length > 0 && (
              <Select
                label="Projeto"
                value={projeto}
                onChange={(v) => {
                  onProjeto(v);
                  vincularProjeto(baixa.id, v);
                  onProjetoMudou?.();
                  show(v ? "Projeto vinculado." : "Projeto removido.");
                }}
                options={[{ value: "", label: "Sem projeto" }, ...projetos.map((p) => ({ value: p.id, label: p.nome }))]}
              />
            )}

            {baixa.status === "pago" ? (
              <>
                <span className="text-caption text-muted leading-[1.5]">
                  Este título já foi liquidado{baixa.paid_date ? ` em ${baixa.paid_date.slice(0, 10).split("-").reverse().join("/")}` : ""}.
                  {comprovante ? ` Comprovante anexado: ${comprovante}.` : " Nenhum comprovante anexado."}
                </span>
                <div className="flex items-center justify-end gap-2">
                  <label className="inline-flex items-center gap-2 text-caption text-muted cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-surface-1">
                    <Icon name="upload" size={14} color="currentColor" />
                    {comprovante ? "Trocar comprovante" : "Anexar comprovante"}
                    <input ref={fileRef} type="file" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { anexarComprovante(baixa.id, f.name); setComprovante(f.name); show("Comprovante anexado."); } }} />
                  </label>
                  <Button variant="primary" onClick={() => onFechar()}>Fechar</Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  <Select label={ehSaida ? "Conta de saída" : "Conta de destino"} value={conta} onChange={setConta}
                    options={(contas).map((c) => ({ value: c.id, label: c.name }))} containerClassName="flex-1 min-w-[170px]" />
                  {ehSaida && (
                    <Select label="Método" value={metodo} onChange={(v) => setMetodo(v as MetodoPagamento)}
                      options={[{ value: "pix", label: "Pix" }, { value: "ted", label: "TED" }, { value: "boleto", label: "Boleto" }, { value: "of", label: "Open Finance" }]}
                      containerClassName="min-w-[150px]" />
                  )}
                </div>

                <label className="inline-flex items-center gap-2 text-caption text-muted cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-surface-1">
                  <Icon name="upload" size={14} color="currentColor" />
                  {comprovante ? <span className="text-ink">{comprovante}</span> : "Anexar comprovante (opcional)"}
                  <input ref={fileRef} type="file" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setComprovante(f.name); }} />
                </label>

                <span className="text-caption text-muted leading-[1.5]">
                  Ao confirmar, o saldo da conta {ehSaida ? "cai" : "sobe"} e o título passa a
                  {ehSaida ? " “pago”" : " “recebido”"}. A operação é idempotente: confirmar de novo não
                  {ehSaida ? " paga" : " credita"} duas vezes.
                </span>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => onFechar()}>Cancelar</Button>
                  <Button variant="primary" onClick={onConfirmar} disabled={enviando || !conta}>
                    {enviando ? "Confirmando…" : (ehSaida ? "Confirmar pagamento" : "Confirmar recebimento")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>,
    document.body,
  );
}

function Linha({ label, value, forte }: { label: string; value: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-caption text-faint">{label}</span>
      <span className={`text-caption ${forte ? "text-ink font-semibold tabular-nums" : "text-ink"}`}>{value}</span>
    </div>
  );
}
