"use client";

/**
 * "Criar novo" — o painel de duas colunas do botão Criar da Sidebar.
 *
 * ⚠️ Ele NÃO reimplementa formulário nenhum. Cada item ou navega para a tela
 * que já cria aquilo, ou dispara o mesmo formulário modal que o menu de
 * lançamentos usa desde a PARTE 01. Um segundo caminho de criação divergiria do
 * primeiro no dia em que um campo mudasse.
 *
 * Montado uma vez no `AppShell`; abre pelo evento `a4p:criar`.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useTipoConta } from "@/components/app/useTipoConta";
import { ReceitaForm } from "@/components/lancamentos/ReceitaForm";
import { TransferenciaForm } from "@/components/lancamentos/TransferenciaForm";
import { PartyForm } from "@/components/lancamentos/PartyForm";
import { ProdutoServicoForm } from "@/components/lancamentos/ProdutoServicoForm";
import { ContratoForm } from "@/components/lancamentos/ContratoForm";

type Acao = { label: string; icon: string; rota?: string; modal?: string };

const CADASTROS: Acao[] = [
  { label: "Nova empresa", icon: "building", rota: "/empresas/nova" },
  { label: "Novo dashboard", icon: "layers", rota: "/dashboard/dashboards/custom" },
  { label: "Nova conta bancária", icon: "credit-card", rota: "/dashboard/registrations/bank-accounts" },
  { label: "Nova categoria", icon: "database", rota: "/dashboard/registrations/chart-of-accounts" },
  { label: "Novo cliente", icon: "users", modal: "cliente" },
  { label: "Novo fornecedor", icon: "building", modal: "fornecedor" },
  { label: "Novo produto", icon: "b", modal: "produto" },
  { label: "Novo projeto", icon: "target", rota: "/dashboard/registrations/projects" },
  { label: "Novo centro de custo", icon: "network", rota: "/dashboard/registrations/cost-centers" },
  { label: "Novo contrato", icon: "file-text", modal: "contrato" },
  { label: "Novo orçamento", icon: "target", rota: "/dashboard/registrations/budgets" },
];

const MOVIMENTACOES: Acao[] = [
  { label: "Nova conta a receber", icon: "arrow-left-right", modal: "receita" },
  { label: "Nova conta a pagar", icon: "arrow-up-right", modal: "despesa" },
  { label: "Nova venda", icon: "shopping-cart", rota: "/dashboard/sales-invoices/new" },
  { label: "Nova compra", icon: "inbox", rota: "/dashboard/purchases/new" },
  { label: "Nova transferência", icon: "repeat", modal: "transferencia" },
];

/** No modo Pessoa Física a criação é curta — não há venda, contrato nem NF. */
const CADASTROS_PF: Acao[] = [
  { label: "Nova carteira / conta", icon: "credit-card", rota: "/dashboard/registrations/bank-accounts" },
  { label: "Nova categoria", icon: "database", rota: "/dashboard/registrations/chart-of-accounts" },
];
const MOVIMENTACOES_PF: Acao[] = [
  { label: "Nova receita", icon: "arrow-left-right", modal: "receita" },
  { label: "Nova despesa", icon: "arrow-up-right", modal: "despesa" },
  { label: "Nova transferência", icon: "repeat", modal: "transferencia" },
];

export function CriarNovo() {
  const router = useRouter();
  const { pessoal } = useTipoConta();
  const [aberto, setAberto] = React.useState(false);
  const [modal, setModal] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener("a4p:criar", abrir);
    return () => window.removeEventListener("a4p:criar", abrir);
  }, []);

  React.useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  function escolher(a: Acao) {
    setAberto(false);
    if (a.rota) { router.push(a.rota); return; }
    if (a.modal) setModal(a.modal);
  }

  const cadastros = pessoal ? CADASTROS_PF : CADASTROS;
  const movimentacoes = pessoal ? MOVIMENTACOES_PF : MOVIMENTACOES;

  return (
    <>
      {aberto && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[70] bg-black/20" onClick={() => setAberto(false)}>
          <div
            // Ancorado no canto superior esquerdo, junto do botão que o abriu —
            // um menu centrado obrigaria os olhos a atravessar a tela e voltar.
            className="absolute left-4 top-[104px] lg:left-[264px] lg:top-[92px] w-[min(620px,calc(100vw-32px))] rounded-card bg-white shadow-popover overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Criar novo</span>
              <button
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="inline-flex p-1 rounded-md hover:bg-surface-2"
              >
                <Icon name="x" size={15} color="var(--color-text-secondary)" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border-soft max-h-[70vh] overflow-y-auto">
              <Coluna titulo="Cadastros" acoes={cadastros} onEscolher={escolher} />
              <Coluna titulo="Movimentações" acoes={movimentacoes} onEscolher={escolher} />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {modal && renderForm(modal, () => setModal(null), setToast)}

      {toast && typeof document !== "undefined" && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink text-white text-[17px] font-medium px-4 py-[11px] rounded-md shadow-popover z-[80]">
          <Icon name="check" size={15} color="var(--color-lime)" />
          <span>{toast}</span>
        </div>,
        document.body,
      )}
    </>
  );
}

function Coluna({
  titulo, acoes, onEscolher,
}: { titulo: string; acoes: Acao[]; onEscolher: (a: Acao) => void }) {
  return (
    <div className="py-2">
      <span className="block px-5 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{titulo}</span>
      {acoes.map((a) => (
        <button
          key={a.label}
          onClick={() => onEscolher(a)}
          className="w-full flex items-center gap-3 px-5 py-[9px] text-left hover:bg-surface-2 transition-colors"
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-surface-2 shrink-0">
            <Icon name={a.icon} size={15} color="var(--color-text-secondary)" />
          </span>
          <span className="text-label text-ink truncate">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function renderForm(acao: string, close: () => void, onToast: (m: string) => void) {
  const p = { onClose: close, onToast };
  switch (acao) {
    case "receita": return <ReceitaForm kind="receita" {...p} />;
    case "despesa": return <ReceitaForm kind="despesa" {...p} />;
    case "transferencia": return <TransferenciaForm {...p} />;
    case "cliente": return <PartyForm role="customer" {...p} />;
    case "fornecedor": return <PartyForm role="supplier" {...p} />;
    case "produto": return <ProdutoServicoForm kind="produto" {...p} />;
    case "contrato": return <ContratoForm {...p} />;
    default: return null;
  }
}
