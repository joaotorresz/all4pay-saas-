"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { Icon, BRL, Skeleton } from "@/components/ui";
import { useProductsList } from "@/components/lancamentos/hooks";
import { getProdutoImagem } from "@/lib/produto-imagem";
import { formatBRL } from "@/lib/format";
import { concluirVendaPos } from "@/lib/pos-venda";
import { cn } from "@/lib/utils";
import {
  loadPosConfig,
  custoTable,
  baseMDR,
  POS_DEFAULT,
  type Grupo,
  type PosConfig,
} from "@/lib/pos-taxas";
import type { Product } from "@/lib/types";

type Tela = "catalogo" | "pagamento" | "processando" | "aprovado";
type Metodo = "pix" | "debito" | "credito_vista" | "parcelado";

const METODOS: { id: Metodo; label: string; icon: string; hint: string }[] = [
  { id: "pix", label: "Pix", icon: "smartphone", hint: "Escaneie o QR Code para pagar" },
  { id: "debito", label: "Débito à vista", icon: "credit-card", hint: "Aproxime, insira ou passe o cartão" },
  { id: "credito_vista", label: "Crédito à vista", icon: "credit-card", hint: "Aproxime, insira ou passe o cartão" },
  { id: "parcelado", label: "Crédito parcelado", icon: "credit-card", hint: "Aproxime, insira ou passe o cartão" },
];

/** Grupo de taxa para o método/parcela escolhido. */
function grupoDe(metodo: Metodo, parcelas: number): Grupo {
  if (metodo === "pix") return "pix";
  if (metodo === "debito") return "debito";
  if (metodo === "credito_vista") return "credito_vista";
  return parcelas <= 6 ? "parc_2_6" : parcelas <= 12 ? "parc_7_12" : parcelas <= 18 ? "parc_13_18" : "parc_19_24";
}

function pct(v: number): string {
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}
const cod = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

export function PosVendaView() {
  const { data: produtos, isLoading } = useProductsList();
  const qc = useQueryClient();
  const [montado, setMontado] = React.useState(false);
  const [cfg, setCfg] = React.useState<PosConfig>(POS_DEFAULT);
  React.useEffect(() => { setMontado(true); setCfg(loadPosConfig()); }, []);

  const [tela, setTela] = React.useState<Tela>("catalogo");
  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [metodo, setMetodo] = React.useState<Metodo | null>(null);
  const [parcelas, setParcelas] = React.useState(2);
  const [recibo, setRecibo] = React.useState<{ nsu: string; auth: string; quando: string } | null>(null);

  const lista = React.useMemo(() => produtos ?? [], [produtos]);
  const byId = React.useMemo(() => new Map(lista.map((p) => [p.id, p])), [lista]);
  const itens = Object.entries(cart).filter(([, q]) => q > 0);
  const qtdTotal = itens.reduce((s, [, q]) => s + q, 0);
  const total = itens.reduce((s, [id, q]) => s + (byId.get(id)?.sale_price ?? 0) * q, 0);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const sub = (id: string) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) - 1) }));
  const remover = (id: string) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });

  // Taxa MDR representativa (bandeira Mastercard) para o método escolhido.
  const grupo = metodo ? grupoDe(metodo, parcelas) : null;
  const custo = custoTable(cfg.mccDesc, cfg.range);
  const taxa = grupo ? baseMDR(custo, cfg.spread, grupo, "master") ?? 0 : 0;
  const liquido = total * (1 - taxa);
  const nParc = metodo === "parcelado" ? parcelas : 1;
  const valorParcela = total / nParc;

  function reset() {
    setCart({}); setMetodo(null); setParcelas(2); setRecibo(null); setTela("catalogo");
  }

  // Processando → registra a venda (recebível pendente) → aprovado.
  React.useEffect(() => {
    if (tela !== "processando") return;
    let cancelado = false;
    (async () => {
      const descricao = `Venda POS · ${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}`;
      try {
        // Entra em "a receber" o líquido (total − taxa MDR); a taxa vira custo
        // de adquirência no DRE (margem visível — relatório, item 6).
        await concluirVendaPos({ valorReceber: liquido, descricao, parcelas: nParc, taxaValor: total - liquido });
      } catch {
        /* simulador segue mesmo se o registro falhar */
      }
      await new Promise((r) => setTimeout(r, 1400));
      if (cancelado) return;
      // Reflete na Central de Recebimentos / dashboard / DRE.
      [
        "open-movements", "receivables", "accounts", "daily-cashflow",
        "daily-cashflow-range", "sales", "sales-list", "risco-input",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setRecibo({ nsu: cod(6), auth: cod(6), quando: new Date().toLocaleString("pt-BR") });
      setTela("aprovado");
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela]);

  const metodoLabel = METODOS.find((m) => m.id === metodo)?.label ?? "";
  const metodoHint = METODOS.find((m) => m.id === metodo)?.hint ?? "";

  return (
    <AppShell title="Simulador de venda" crumb="Central POS · maquininha">
      <div className="flex justify-center pb-6">
        {/* Device frame 9:16 (vertical) */}
        <div className="w-full max-w-[420px] aspect-[9/16] max-h-[calc(100vh-7rem)] rounded-card border border-border bg-white shadow-popover overflow-hidden flex flex-col">
          {/* ---- CATÁLOGO ---- */}
          {tela === "catalogo" && (
            <>
              <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between shrink-0">
                <span className="text-label font-medium text-ink">all4pay · Caixa</span>
                <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                  <Icon name="shopping-cart" size={15} color="var(--color-text-secondary)" />
                  {qtdTotal}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {isLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[140px] w-full" rounded="card" />)}
                  </div>
                ) : lista.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6">
                    <Icon name="scan-line" size={26} color="var(--color-text-tertiary)" />
                    <p className="text-caption text-muted">Nenhum produto cadastrado. Cadastre itens em Produtos para vendê-los aqui.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {lista.map((p) => (
                      <ProdutoCard key={p.id} p={p} qty={cart[p.id] ?? 0} montado={montado} onAdd={() => add(p.id)} onSub={() => sub(p.id)} />
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-border-soft p-3 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-caption text-muted">{qtdTotal} {qtdTotal === 1 ? "item" : "itens"}</span>
                  <span className="text-ink"><BRL value={total} /></span>
                </div>
                <button
                  disabled={qtdTotal === 0}
                  onClick={() => setTela("pagamento")}
                  className="w-full h-11 rounded-md bg-ink text-white text-[17px] font-medium disabled:opacity-40 active:scale-[0.99]"
                >
                  Avançar para o pagamento
                </button>
              </div>
            </>
          )}

          {/* ---- PAGAMENTO ---- */}
          {tela === "pagamento" && (
            <>
              <div className="px-4 py-3 border-b border-border-soft flex items-center gap-2 shrink-0">
                <button onClick={() => setTela("catalogo")} className="inline-flex p-1 rounded-md hover:bg-surface-2" aria-label="Voltar">
                  <Icon name="chevron-left" size={18} color="var(--color-text-secondary)" />
                </button>
                <span className="text-label font-medium text-ink">Checkout</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                {/* Carrinho */}
                <div className="flex flex-col gap-2">
                  {itens.map(([id, q]) => {
                    const p = byId.get(id);
                    if (!p) return null;
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[15px] text-ink truncate">{p.name}</div>
                          <div className="text-caption text-faint tabular-nums">{formatBRL(p.sale_price ?? 0)}</div>
                        </div>
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => sub(id)} className="w-7 h-7 inline-flex items-center justify-center rounded-sm border border-border hover:bg-surface-2"><Icon name="minus" size={13} /></button>
                          <span className="w-6 text-center text-[15px] text-ink tabular-nums">{q}</span>
                          <button onClick={() => add(id)} className="w-7 h-7 inline-flex items-center justify-center rounded-sm border border-border hover:bg-surface-2"><Icon name="plus" size={13} /></button>
                          <button onClick={() => remover(id)} className="w-7 h-7 inline-flex items-center justify-center rounded-sm hover:bg-surface-2 ml-1" aria-label="Remover"><Icon name="trash-2" size={14} color="var(--color-text-tertiary)" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Forma de pagamento */}
                <div>
                  <div className="text-label font-medium text-muted mb-2">Forma de pagamento</div>
                  <div className="grid grid-cols-2 gap-2">
                    {METODOS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMetodo(m.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 h-11 rounded-md border text-left",
                          metodo === m.id ? "border-ink bg-surface-1" : "border-border hover:bg-surface-1",
                        )}
                      >
                        <Icon name={m.icon} size={16} color={metodo === m.id ? "var(--color-ink)" : "var(--color-text-secondary)"} />
                        <span className={cn("text-[15px]", metodo === m.id ? "text-ink" : "text-muted")}>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  {metodo === "parcelado" && (
                    <div className="mt-3">
                      <div className="text-label font-medium text-muted mb-2">Parcelas</div>
                      <div className="flex flex-wrap gap-[6px]">
                        {Array.from({ length: 20 }, (_, i) => i + 2).map((n) => (
                          <button
                            key={n}
                            onClick={() => setParcelas(n)}
                            className={cn(
                              "min-w-[42px] h-9 px-2 rounded-pill border text-caption tabular-nums",
                              parcelas === n ? "border-ink bg-ink text-white" : "border-border text-muted hover:bg-surface-1",
                            )}
                          >
                            {n}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Resumo + cobrar */}
              <div className="border-t border-border-soft p-3 shrink-0">
                <div className="flex items-center justify-between text-caption text-muted mb-1">
                  <span>Total</span>
                  <span className="text-ink text-body"><BRL value={total} /></span>
                </div>
                {metodo && (
                  <>
                    <div className="flex items-center justify-between text-caption text-faint mb-1">
                      <span>Taxa MDR · {metodoLabel}{metodo === "parcelado" ? ` ${parcelas}x` : ""}</span>
                      <span className="tabular-nums">{pct(taxa)}</span>
                    </div>
                    {metodo === "parcelado" && (
                      <div className="flex items-center justify-between text-caption text-faint mb-1">
                        <span>{parcelas}× de</span>
                        <span className="tabular-nums">{formatBRL(valorParcela)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-caption text-faint mb-2">
                      <span>Você recebe (líquido)</span>
                      <span className="tabular-nums text-positive">{formatBRL(liquido)}</span>
                    </div>
                  </>
                )}
                <button
                  disabled={!metodo}
                  onClick={() => setTela("processando")}
                  className="w-full h-11 rounded-md bg-lime text-on-lime text-[17px] font-medium disabled:opacity-40 active:scale-[0.99]"
                >
                  Cobrar {formatBRL(total)}
                </button>
              </div>
            </>
          )}

          {/* ---- PROCESSANDO ---- */}
          {tela === "processando" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 text-center">
              <div className="w-14 h-14 rounded-full border-[3px] border-surface-3 border-t-ink animate-spin" />
              <div>
                <div className="text-h3 text-ink">Processando pagamento</div>
                <div className="text-caption text-muted mt-1">{metodoHint}</div>
              </div>
              <div className="text-ink"><BRL value={total} /></div>
            </div>
          )}

          {/* ---- APROVADO ---- */}
          {tela === "aprovado" && recibo && (
            <>
              <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-lime flex items-center justify-center mt-4">
                  <Icon name="check" size={30} color="var(--color-on-lime)" />
                </div>
                <div className="text-h2 text-ink mt-4">Aprovado</div>
                <div className="text-display leading-none mt-3"><BRL value={total} /></div>
                <div className="text-caption text-muted mt-2">
                  {metodoLabel}{metodo === "parcelado" ? ` · ${parcelas}× de ${formatBRL(valorParcela)}` : ""}
                </div>

                <div className="w-full mt-6 rounded-md border border-border-soft divide-y divide-border-soft text-left">
                  <Linha k="NSU" v={recibo.nsu} />
                  <Linha k="Autorização" v={recibo.auth} />
                  <Linha k="Taxa MDR" v={pct(taxa)} />
                  <Linha k="Valor líquido" v={formatBRL(liquido)} />
                  <Linha k="Data/hora" v={recibo.quando} />
                </div>
                <div className="w-full mt-3 inline-flex items-center gap-2 text-caption text-muted">
                  <Icon name="check" size={14} color="var(--color-positive)" />
                  Recebível {nParc > 1 ? `(${nParc} parcelas) ` : ""}lançado na Central de Recebimentos
                </div>
              </div>
              <div className="border-t border-border-soft p-3 shrink-0 flex flex-col gap-2">
                <a href="/recebimentos" className="w-full h-11 rounded-md border border-border text-ink text-[17px] font-medium inline-flex items-center justify-center active:scale-[0.99]">
                  Ver na Central de Recebimentos
                </a>
                <button onClick={reset} className="w-full h-11 rounded-md bg-ink text-white text-[17px] font-medium active:scale-[0.99]">
                  Nova venda
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Linha({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-[10px]">
      <span className="text-caption text-muted">{k}</span>
      <span className="text-[15px] text-ink tabular-nums">{v}</span>
    </div>
  );
}

function ProdutoCard({ p, qty, montado, onAdd, onSub }: { p: Product; qty: number; montado: boolean; onAdd: () => void; onSub: () => void }) {
  const img = montado ? getProdutoImagem(p.name) : null;
  return (
    <div className={cn("rounded-card border bg-white overflow-hidden flex flex-col", qty > 0 ? "border-ink" : "border-border-soft")}>
      <button onClick={onAdd} className="block text-left" title="Adicionar">
        <div className="aspect-[4/3] bg-surface-1 flex items-center justify-center overflow-hidden relative">
          {img
            // eslint-disable-next-line @next/next/no-img-element -- dataURL local (cardápio)
            ? <img src={img} alt={p.name} className="w-full h-full object-cover" />
            : <Icon name="scan-line" size={22} color="var(--color-text-tertiary)" />}
          {qty > 0 && (
            <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1 rounded-pill bg-ink text-white text-caption inline-flex items-center justify-center tabular-nums">{qty}</span>
          )}
        </div>
        <div className="p-2">
          <div className="text-[14px] text-ink truncate">{p.name}</div>
          <div className="text-ink tabular-nums text-caption"><BRL value={p.sale_price ?? 0} /></div>
        </div>
      </button>
      {qty > 0 && (
        <div className="flex items-center justify-between px-2 pb-2 -mt-1">
          <button onClick={onSub} className="w-7 h-7 inline-flex items-center justify-center rounded-sm border border-border hover:bg-surface-2"><Icon name="minus" size={13} /></button>
          <span className="text-[15px] text-ink tabular-nums">{qty}</span>
          <button onClick={onAdd} className="w-7 h-7 inline-flex items-center justify-center rounded-sm border border-border hover:bg-surface-2"><Icon name="plus" size={13} /></button>
        </div>
      )}
    </div>
  );
}
