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

interface RouteItem { label: string; href: string; icon: string; kw: string; event?: string }
const ROUTES: RouteItem[] = [
  { label: "Início", href: "/", icon: "house", kw: "dashboard visao geral fluxo de caixa faturamento home painel" },
  { label: "Meus dashboards", href: "/dashboard/dashboards?aba=meus", icon: "layers", kw: "dashboard customizado personalizado widget kpi grafico montar criar meu painel acompanhamento semanal" },
  { label: "Dashboard Financeiro", href: "/dashboard/dashboards?aba=financeiro", icon: "trending-up", kw: "dashboard financeiro saldo geracao de caixa entradas saidas por categoria mes" },
  { label: "Dashboard de Vendas", href: "/dashboard/dashboards?aba=vendas", icon: "credit-card", kw: "dashboard vendas cac ltv ebitda faturamento reembolso chargeback aquisicao cliente" },
  { label: "Dashboard de Assinaturas", href: "/dashboard/dashboards?aba=assinaturas", icon: "repeat", kw: "dashboard assinatura mrr arr churn assinante recorrencia saas produto" },
  { label: "Dash de Contas a Pagar", href: "/dashboard/dashboards?aba=pagar", icon: "arrow-up-right", kw: "dash contas a pagar vencimento atrasado a vencer fornecedor titulo periodo" },
  { label: "Dash de Contas a Receber", href: "/dashboard/dashboards?aba=receber", icon: "arrow-left-right", kw: "dash contas a receber inadimplencia vencimento atrasado cliente titulo periodo" },
  { label: "Calendário financeiro", href: "/dashboard/financial/calendar", icon: "calendar", kw: "calendario dia mes vencimento fluxo diario saldo total agenda financeira" },
  { label: "Boas-vindas (dashboard)", href: "/dashboard", icon: "house", kw: "boas vindas saudacao atalhos acesso rapido empresa ativa dashboard home" },
  { label: "Comece por aqui", href: "/comece", icon: "target", kw:"comece jornada adesao primeiros passos onboarding tutorial aprender progresso guia inicio" },
  { label: "Upload de dados", href: "/upload?aba=enviar", icon: "upload", kw: "importar extrato ofx csv upload boleto comprovante nota ocr caixa de entrada entrada de dados onboarding ingestao enviar" },
  { label: "Open finance", href: "/upload?aba=conectar", icon: "building", kw: "open finance banco conta pluggy conectar ingestao posicao saldo" },
  { label: "Fluxo de Caixa", href: "/fluxo-caixa", icon: "trending-up", kw: "fluxo caixa cashflow projecao monte carlo cenarios runway burn waterfall heatmap calendario tesouraria" },
  { label: "Contas a Receber (lista)", href: "/dashboard/financial/accounts-and-transfers?tab=receivables", icon: "arrow-left-right", kw: "contas a receber titulos lista recebidas atrasadas cliente vencimento baixa lote" },
  { label: "Contas a Pagar (lista)", href: "/dashboard/financial/accounts-and-transfers?tab=payables", icon: "arrow-up-right", kw: "contas a pagar titulos lista pagas atrasadas fornecedor vencimento baixa lote especie" },
  { label: "Transferências entre contas", href: "/dashboard/financial/accounts-and-transfers?tab=transfers", icon: "arrow-left-right", kw: "transferencia entre contas origem destino ted doc chegada conciliacao" },
  { label: "Nova conta a receber", href: "/dashboard/financial/receivables/new", icon: "plus", kw: "nova conta a receber lancar titulo cliente competencia vencimento rateio anexo repetir" },
  { label: "Nova conta a pagar", href: "/dashboard/financial/payables/new", icon: "plus", kw: "nova conta a pagar lancar titulo fornecedor especie nfe nfse pix rateio anexo" },
  { label: "Conciliação bancária", href: "/dashboard/financial/reconciliation", icon: "list-checks", kw: "conciliacao bancaria ofx regras quadros conferencia fechamento extrato bater" },
  { label: "Extrato da conta", href: "/dashboard/financial/statement", icon: "receipt", kw: "extrato conta bancaria saldo corrente periodo movimentacoes" },
  { label: "Fatura do cartão", href: "/dashboard/financial/credit-card-invoices", icon: "credit-card", kw: "fatura cartao de credito ciclo fechamento vencimento aberta paga parcial" },
  { label: "Fluxo de caixa do mês", href: "/dashboard/reports/cash-flow", icon: "trending-up", kw: "fluxo de caixa mensal saldo inicial final entradas saidas transferencia contas" },
  { label: "Importar em lote (planilha)", href: "/dashboard/financial/import", icon: "upload", kw: "importar lote planilha xlsx modelo contas a receber pagar transferencias" },
  // Duas portas para a MESMA IA: o painel flutuante (rápido, sobre a tela atual)
  // e a tela cheia com histórico de conversas.
  { label: "Perguntar à All 4 Pay AI", href: "/", event: "a4p:open-ia", icon: "sparkles", kw: "ia copiloto assistente perguntas claude conversacional chat all4pay perguntar abrir painel" },
  { label: "All 4 Pay AI (tela cheia)", href: "/all4pay-ai", icon: "sparkles", kw: "ia chat conversas historico all4pay ai tela cheia assistente perguntar copiloto" },
  { label: "Investor update", href: "/investidores", icon: "mail", kw: "investor update investidor relatorio mensal mrr arr burn runway captacao board email" },
  { label: "Plano de contratações", href: "/contratacoes", icon: "users", kw: "headcount contratacao contratar vaga equipe folha salario encargos runway plano time hiring" },
  { label: "Razão (GL)", href: "/contabilidade?aba=razao", icon: "receipt", kw: "razao ledger gl dupla entrada balancete lancamento debito credito contabilidade backfill" },
  { label: "Relatórios (Razão)", href: "/contabilidade?aba=relatorios", icon: "receipt", kw: "relatorios dre balanco patrimonial pivot dimensao razao gl balance sheet contabil" },
  { label: "Consolidado (multi-empresa)", href: "/contabilidade?aba=consolidado", icon: "building", kw: "consolidado consolidacao multi empresa entidade holding filial matriz grupo" },
  { label: "Envio de NFs ao contador", href: "/dashboard/accounting/nfe-export", icon: "mail", kw: "envio nfs contador xml mensal destinatario email verificado escritorio contabil pacote" },
  { label: "Gerar TXT contábil (Domínio)", href: "/dashboard/accounting/dominio-export", icon: "file-text", kw: "txt contabil dominio lanctos partidas simples extrato exportar escritorio ansi" },
  { label: "Assinatura e plano", href: "/dashboard/administration/subscription", icon: "credit-card", kw: "assinatura plano expiracao usuarios ativos contas open finance panorama" },
  { label: "Dados da empresa", href: "/dashboard/administration/company-data", icon: "building", kw: "dados empresa cnpj razao social logo regime tributario endereco contatos preferencias" },
  { label: "Gerenciar usuários", href: "/dashboard/administration/users", icon: "users", kw: "usuarios permissoes perfil admin convidar remover acesso equipe" },
  { label: "Logs de auditoria", href: "/dashboard/administration/audit-logs", icon: "list-checks", kw: "logs auditoria historico alteracoes trilha quem mudou origem entidade" },
  { label: "Integrações", href: "/dashboard/administration/integrations", icon: "link", kw: "integracoes plataformas vendas open finance dda certificado api mcp token webhook" },
  { label: "Relatórios exportados", href: "/dashboard/administration/exported-reports", icon: "arrow-down-to-line", kw: "relatorios exportados fila exportacao pdf xlsx download expira" },
  { label: "Central de ajuda", href: "/dashboard/help", icon: "help-circle", kw: "ajuda suporte chamado duvida chat tour guiado anuncios novidades" },
  { label: "Tours guiados", href: "/dashboard/help?aba=tours", icon: "layers", kw: "tour guiado passo a passo aprender tela treinamento onboarding" },
  { label: "Anúncios e novidades", href: "/dashboard/help?aba=anuncios", icon: "mail", kw: "anuncios novidades mensagens comunicados release notes" },
  { label: "DRE", href: "/dashboard/reports/dre", icon: "receipt", kw: "resultado demonstracao lucro receita despesa" },
  { label: "DRE (relatório em cascata)", href: "/dashboard/reports?aba=dre", icon: "file-text", kw: "dre relatorio cascata analise vertical horizontal ebitda margem contribuicao exportar pdf xlsx" },
  { label: "DFC (fluxo de caixa)", href: "/dashboard/reports?aba=dfc", icon: "file-text", kw: "dfc demonstracao fluxo de caixa saldo inicial regime caixa relatorio" },
  { label: "DRE Multiempresas", href: "/dashboard/reports?aba=dre-multi", icon: "building", kw: "dre multiempresas consolidado grupo holding varias empresas" },
  { label: "DFC Multiempresas", href: "/dashboard/reports?aba=dfc-multi", icon: "building", kw: "dfc multiempresas consolidado grupo holding fluxo de caixa" },
  { label: "Fechamento mensal", href: "/dashboard/reports?aba=fechamento", icon: "file-text", kw: "fechamento mensal relatorio analise kpi pontos de atencao docx word assinatura" },
  { label: "Orçamento vs Realizado", href: "/orcamento", icon: "receipt", kw: "orcamento budget variancia flux analysis orcado realizado desvio analise variacao planejado" },
  { label: "Fechamento contábil", href: "/contabilidade?aba=fechamento", icon: "shield-check", kw: "fechamento close checklist periodo travado locked provisao accrual conciliacao mensal" },
  { label: "Cronogramas (amort./deprec.)", href: "/contabilidade?aba=cronogramas", icon: "layers", kw: "amortizacao depreciacao despesa antecipada prepaid ativo imobilizado fixed asset cronograma schedule" },
  { label: "Reconhecimento de receita", href: "/contabilidade?aba=receita", icon: "trending-up", kw: "reconhecimento receita diferida deferred revenue mrr arr waterfall ifrs 15 cpc 47 asc 606 recorrencia assinatura" },
  { label: "Dimensões & Tags", href: "/contabilidade?aba=dimensoes", icon: "layers", kw: "dimensoes tags pivot drill-down categoria centro custo contraparte relatorio dinamico" },
  { label: "Inteligência", href: "/all4pay-ai?aba=quant", icon: "activity", kw: "quant kpis score saude" },
  { label: "Decisão", href: "/all4pay-ai?aba=decisao", icon: "target", kw: "recomendacoes monte carlo" },
  { label: "Autônomo", href: "/all4pay-ai?aba=autonomo", icon: "cpu", kw: "cobranca decisoes automatico whatsapp" },
  { label: "Risco de caixa", href: "/all4pay-ai?aba=risco", icon: "trending-up", kw: "liquidez runway ruptura" },
  { label: "Inadimplência", href: "/dashboard/financial/overdue", icon: "gauge", kw: "credito clientes atraso cobranca" },
  { label: "Orquestração", href: "/plataforma?aba=orquestracao", icon: "network", kw: "eventos ledger cascata plataforma" },
  { label: "Infraestrutura", href: "/plataforma?aba=infraestrutura", icon: "layers", kw: "ledger pagamentos fila plataforma" },
  { label: "Arquitetura", href: "/plataforma?aba=arquitetura", icon: "building", kw: "tesouraria treasury plataforma" },
  { label: "Inteligência de dados", href: "/all4pay-ai?aba=dados", icon: "database", kw: "moat benchmark dna" },
  { label: "Governança", href: "/governanca", icon: "shield-check", kw: "auditoria rbac aprovacao" },
  { label: "Conciliação", href: "/upload?aba=conciliar", icon: "list-checks", kw: "reconciliacao matching conciliar ingestao" },
  { label: "Vendas", href: "/dashboard/sales-invoices", icon: "shopping-cart", kw: "vendas notas fiscais status venda nf plataforma hotmart taxa liquido" },
  { label: "Nova venda", href: "/dashboard/sales-invoices/new", icon: "plus", kw: "nova venda lancar produto taxa plataforma comissao coprodutor afiliado liquido" },
  { label: "Notas fiscais", href: "/dashboard/sales-invoices/invoices", icon: "file-text", kw: "nota fiscal nf emitida processando cancelada negada download lote" },
  { label: "Provisionamento de impostos", href: "/dashboard/sales-invoices/tax-provisioning", icon: "receipt", kw: "impostos provisionamento icms pis cofins ipi iss csll inss irpj lucro presumido conta a pagar" },
  { label: "Links de pagamento", href: "/dashboard/sales-invoices/payment-links", icon: "credit-card", kw: "link de pagamento qr code cobrar cliente pix checkout" },
  { label: "Assinaturas (vendas)", href: "/dashboard/sales-invoices/subscriptions", icon: "repeat", kw: "assinaturas recorrentes ciclo status cancelada expirada mrr" },
  { label: "Compras", href: "/dashboard/purchases", icon: "shopping-cart", kw: "compras pedido de compra aprovacao aprovada reprovada aguardando fornecedor competencia" },
  { label: "Nova compra", href: "/dashboard/purchases/new", icon: "plus", kw: "nova compra pedido fornecedor parcelado competencia vencimento rateio anexo" },
  { label: "Boletos recebidos", href: "/dashboard/purchases/received-boletos", icon: "file-text", kw: "boleto dda linha digitavel codigo de barras vencido a vencer beneficiario" },
  { label: "NFs recebidas", href: "/dashboard/purchases/received-invoices", icon: "receipt", kw: "nota fiscal recebida sefaz xml chave de acesso danfe fornecedor validacao" },
  { label: "Vendas (POS/orçamentos)", href: "/vendas", icon: "arrow-left-right", kw: "pedidos orcamentos compras pos maquininha" },
  { label: "Venda na maquininha (POS)", href: "/vendas?aba=pos", icon: "credit-card", kw: "pos maquininha cartao adquirencia venda liquido mdr" },
  { label: "Taxas da maquininha (POS)", href: "/vendas?aba=pos-taxas", icon: "credit-card", kw: "pos taxas mdr antecipacao mcc bandeira adquirencia" },
  { label: "Produtos", href: "/dashboard/registrations/products", icon: "credit-card", kw: "estoque sku" },
  { label: "Serviços", href: "/dashboard/registrations/products", icon: "repeat", kw: "servico" },
  { label: "Clientes", href: "/dashboard/registrations/clients", icon: "users", kw: "clientes contatos cadastro cpf cnpj categoria padrao receita" },
  { label: "Fornecedores", href: "/dashboard/registrations/suppliers", icon: "users", kw: "fornecedores contatos cadastro cnpj pix dados pj simples nacional" },
  { label: "Contas bancárias", href: "/dashboard/registrations/bank-accounts", icon: "building", kw: "conta bancaria banco agencia cartao de credito fatura codigo dominio saldo inicial" },
  { label: "Contratos", href: "/dashboard/registrations/contracts", icon: "file-text", kw: "contrato fornecedor cliente vigencia rateio vendas recorrentes anexo" },
  { label: "Orçamento (cadastro)", href: "/dashboard/registrations/budgets", icon: "target", kw: "orcamento budget planejamento previsto alocacao mensal por categoria previsto realizado" },
  { label: "Configurações", href: "/configuracoes", icon: "settings", kw: "empresa perfil governanca" },
  // Único acesso ao drawer depois que a engrenagem saiu do header da Home.
  { label: "Personalizar Home", href: "/", icon: "settings", kw: "personalizar home widgets blocos cards ligar desligar reordenar", event: "a4p:open-personalizar" },
];

interface Hit { key: string; grupo: string; titulo: string; sub?: string; href: string; icon: string; event?: string; contatoId?: string }

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
          key: `nav:${r.href}:${r.label}`, grupo: "Navegação", titulo: r.label, href: r.href, icon: r.icon, event: r.event,
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
            href: "/dashboard/registrations/clients", icon: "users", contatoId: p.id,
          })),
        ),
      );
      out.push(
        ...cap(
          (products.data ?? []).filter((p) => match(`${p.name} ${p.sku ?? ""}`)).map((p) => ({
            key: `prd:${p.id}`, grupo: "Produtos", titulo: p.name, sub: p.sku ?? undefined, href: "/dashboard/registrations/products", icon: "credit-card",
          })),
        ),
      );
      out.push(
        ...cap(
          (services.data ?? []).filter((s) => match(s.name)).map((s) => ({
            key: `srv:${s.id}`, grupo: "Serviços", titulo: s.name, href: "/dashboard/registrations/products", icon: "repeat",
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
    if (h.contatoId) { window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: h.contatoId } })); return; }
    if (h.event) { window.dispatchEvent(new Event(h.event)); return; }
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
