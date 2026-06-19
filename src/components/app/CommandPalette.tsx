"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui";
import { listParties, listProducts, listServices, listSales } from "@/lib/cadastros";

/**
 * Command palette (⌘K / Ctrl+K) — busca global em todo o sistema:
 * navegação (páginas) + contatos + produtos + serviços + vendas.
 * Abre pelo botão de busca da Sidebar (evento a4p:open-search) ou pelo atalho.
 * Lê os mesmos accessors das listas (demo-safe) e só busca quando aberto.
 */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");

interface RouteItem { label: string; href: string; icon: string; kw: string }
const ROUTES: RouteItem[] = [
  { label: "Início", href: "/", icon: "house", kw: "dashboard visao geral fluxo de caixa faturamento home painel" },
  { label: "Entrada de dados", href: "/upload?aba=enviar", icon: "upload", kw: "importar extrato ofx csv upload boleto comprovante nota ocr caixa de entrada onboarding ingestao enviar" },
  { label: "Open finance", href: "/upload?aba=conectar", icon: "building", kw: "open finance banco conta pluggy conectar ingestao posicao saldo" },
  { label: "Fluxo de Caixa", href: "/fluxo-caixa", icon: "trending-up", kw: "fluxo caixa cashflow projecao monte carlo cenarios runway burn waterfall heatmap calendario tesouraria" },
  { label: "Copiloto", href: "/copiloto", icon: "sparkles", kw: "ia assistente perguntas claude razao gl rascunho lancamento conversacional decisoes acoes agir chat" },
  { label: "Razão (GL)", href: "/razao", icon: "receipt", kw: "razao ledger gl dupla entrada balancete lancamento debito credito contabilidade backfill" },
  { label: "Relatórios (Razão)", href: "/relatorios", icon: "receipt", kw: "relatorios dre balanco patrimonial pivot dimensao razao gl balance sheet contabil" },
  { label: "Consolidado (multi-empresa)", href: "/consolidado", icon: "building", kw: "consolidado consolidacao multi empresa entidade holding filial matriz grupo" },
  { label: "DRE", href: "/dre", icon: "receipt", kw: "resultado demonstracao lucro receita despesa" },
  { label: "Orçamento vs Realizado", href: "/orcamento", icon: "receipt", kw: "orcamento budget variancia flux analysis orcado realizado desvio analise variacao planejado" },
  { label: "Fechamento contábil", href: "/fechamento", icon: "shield-check", kw: "fechamento close checklist periodo travado locked provisao accrual conciliacao mensal" },
  { label: "Cronogramas (amort./deprec.)", href: "/cronogramas", icon: "layers", kw: "amortizacao depreciacao despesa antecipada prepaid ativo imobilizado fixed asset cronograma schedule" },
  { label: "Reconhecimento de receita", href: "/receita", icon: "trending-up", kw: "reconhecimento receita diferida deferred revenue mrr arr waterfall ifrs 15 cpc 47 asc 606 recorrencia assinatura" },
  { label: "Dimensões & Tags", href: "/dimensoes", icon: "layers", kw: "dimensoes tags pivot drill-down categoria centro custo contraparte relatorio dinamico" },
  { label: "Inteligência", href: "/inteligencia", icon: "activity", kw: "quant kpis score saude" },
  { label: "Decisão", href: "/decisao", icon: "target", kw: "recomendacoes monte carlo" },
  { label: "Autônomo", href: "/autonomo", icon: "cpu", kw: "cobranca decisoes automatico whatsapp" },
  { label: "Risco de caixa", href: "/risco", icon: "trending-up", kw: "liquidez runway ruptura" },
  { label: "Inadimplência", href: "/inadimplencia", icon: "gauge", kw: "credito clientes atraso cobranca" },
  { label: "Orquestração", href: "/orquestracao", icon: "network", kw: "eventos ledger cascata" },
  { label: "Infraestrutura", href: "/infraestrutura", icon: "layers", kw: "ledger pagamentos fila" },
  { label: "Arquitetura", href: "/arquitetura", icon: "building", kw: "tesouraria treasury" },
  { label: "Inteligência de dados", href: "/dados", icon: "database", kw: "moat benchmark dna" },
  { label: "Governança", href: "/governanca", icon: "shield-check", kw: "auditoria rbac aprovacao" },
  { label: "Conciliação", href: "/upload?aba=conciliar", icon: "list-checks", kw: "reconciliacao matching conciliar ingestao" },
  { label: "Automações", href: "/automacoes", icon: "workflow", kw: "regras alertas notificacoes" },
  { label: "Vendas", href: "/vendas", icon: "arrow-left-right", kw: "pedidos orcamentos compras" },
  { label: "Produtos", href: "/produtos", icon: "credit-card", kw: "estoque sku" },
  { label: "Serviços", href: "/servicos", icon: "repeat", kw: "servico" },
  { label: "Contatos", href: "/contatos", icon: "file-text", kw: "clientes fornecedores telefone" },
  { label: "Configurações", href: "/configuracoes", icon: "settings", kw: "empresa perfil governanca" },
];

interface Hit { key: string; grupo: string; titulo: string; sub?: string; href: string; icon: string }

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Abertura: atalho ⌘K / Ctrl+K e evento do botão da Sidebar.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("a4p:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("a4p:open-search", onOpen);
    };
  }, []);

  React.useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Entidades — só busca quando aberto (cache compartilhado com as listas).
  const enabled = open;
  const parties = useQuery({ queryKey: ["parties-list"], queryFn: listParties, enabled });
  const products = useQuery({ queryKey: ["products-list"], queryFn: listProducts, enabled });
  const services = useQuery({ queryKey: ["services-list"], queryFn: listServices, enabled });
  const sales = useQuery({ queryKey: ["sales-list"], queryFn: listSales, enabled });

  const hits = React.useMemo<Hit[]>(() => {
    const nq = norm(q.trim());
    const match = (hay: string) => !nq || norm(hay).includes(nq);
    const cap = (arr: Hit[]) => arr.slice(0, nq ? 6 : 4);
    const out: Hit[] = [];

    out.push(
      ...cap(
        ROUTES.filter((r) => match(`${r.label} ${r.kw}`)).map((r) => ({
          key: `nav:${r.href}`, grupo: "Navegação", titulo: r.label, href: r.href, icon: r.icon,
        })),
      ),
    );

    // Entidades só entram quando há texto (sem query, mostramos só navegação).
    if (nq) {
      out.push(
        ...cap(
          (parties.data ?? []).filter((p) => match(`${p.name} ${p.doc ?? ""} ${p.phone ?? ""}`)).map((p) => ({
            key: `pty:${p.id}`, grupo: "Contatos", titulo: p.name,
            sub: [p.is_customer && "Cliente", p.is_supplier && "Fornecedor", p.phone].filter(Boolean).join(" · ") || undefined,
            href: "/contatos", icon: "file-text",
          })),
        ),
      );
      out.push(
        ...cap(
          (products.data ?? []).filter((p) => match(`${p.name} ${p.sku ?? ""}`)).map((p) => ({
            key: `prd:${p.id}`, grupo: "Produtos", titulo: p.name, sub: p.sku ?? undefined, href: "/produtos", icon: "credit-card",
          })),
        ),
      );
      out.push(
        ...cap(
          (services.data ?? []).filter((s) => match(s.name)).map((s) => ({
            key: `srv:${s.id}`, grupo: "Serviços", titulo: s.name, href: "/servicos", icon: "repeat",
          })),
        ),
      );
      out.push(
        ...cap(
          (sales.data ?? []).filter((s) => match(`${s.party_name} ${s.id} ${s.kind}`)).map((s) => ({
            key: `sale:${s.id}`, grupo: "Vendas", titulo: `${s.party_name}`, sub: `${s.kind} · ${s.id}`, href: "/vendas", icon: "arrow-left-right",
          })),
        ),
      );
    }
    return out;
  }, [q, parties.data, products.data, services.data, sales.data]);

  React.useEffect(() => { setSel(0); }, [q]);

  const ir = (h: Hit) => {
    setOpen(false);
    router.push(h.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && hits[sel]) { e.preventDefault(); ir(hits[sel]); }
  };

  if (!open) return null;

  // Índice global para destacar/navegar; agrupa visualmente por seção.
  let idx = -1;
  const grupos = Array.from(new Set(hits.map((h) => h.grupo)));

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/20 backdrop-blur-[1px] pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-card shadow-popover border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-border-soft">
          <Icon name="search" size={16} color="var(--color-text-tertiary)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar páginas, contatos, produtos, serviços, vendas…"
            className="flex-1 bg-transparent outline-none text-[18px] text-ink py-[14px] placeholder:text-placeholder"
          />
          <kbd className="text-[13px] font-medium text-faint bg-surface-2 rounded-[5px] px-[5px] py-[2px]">esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-2">
          {hits.length === 0 ? (
            <div className="px-4 py-8 text-center text-caption text-faint">
              {q.trim() ? "Nada encontrado." : "Digite para buscar."}
            </div>
          ) : (
            grupos.map((g) => (
              <div key={g} className="mb-1">
                <div className="px-4 py-1 text-[13px] font-medium text-faint tracking-wide">{g}</div>
                {hits.filter((h) => h.grupo === g).map((h) => {
                  idx += 1;
                  const on = idx === sel;
                  const i = idx;
                  return (
                    <button
                      key={h.key}
                      onMouseEnter={() => setSel(i)}
                      onClick={() => ir(h)}
                      className={
                        "w-full flex items-center gap-3 px-4 py-[9px] text-left " +
                        (on ? "bg-surface-2" : "bg-transparent")
                      }
                    >
                      <Icon name={h.icon} size={16} color={on ? "var(--color-ink)" : "var(--color-text-secondary)"} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[17px] text-ink truncate">{h.titulo}</span>
                        {h.sub && <span className="block text-caption text-faint truncate">{h.sub}</span>}
                      </span>
                      {on && <span className="text-[16px] text-faint">↵</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
