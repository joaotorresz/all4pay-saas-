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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useTipoConta } from "@/components/app/useTipoConta";
import { ReceitaForm } from "@/components/lancamentos/ReceitaForm";
import { TransferenciaForm } from "@/components/lancamentos/TransferenciaForm";
import { PartyForm } from "@/components/lancamentos/PartyForm";
import { ProdutoServicoForm } from "@/components/lancamentos/ProdutoServicoForm";
import { ContratoForm } from "@/components/lancamentos/ContratoForm";

import {
  ACOES_CADASTROS as CADASTROS,
  ACOES_MOVIMENTACOES as MOVIMENTACOES,
  ACOES_CADASTROS_PF as CADASTROS_PF,
  ACOES_MOVIMENTACOES_PF as MOVIMENTACOES_PF,
  type Acao,
} from "@/core/criar";

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

  /**
   * Clique NORMAL num item: fecha o painel e, se a ação é de modal, abre o
   * modal sem navegar (é o caminho mais rápido para quem já está no app).
   *
   * ⚠️ **Clique com modificador não passa por aqui.** Ctrl/Cmd/Shift/botão do
   * meio são tratados pelo próprio `<a>`: o `onClick` chama `preventDefault`
   * apenas quando NÃO há modificador. Era isto que faltava — dezesseis ações e
   * nenhuma abria em nova aba.
   */
  function escolher(e: React.MouseEvent, a: Acao) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // deixa o <a> agir
    e.preventDefault();
    setAberto(false);
    if (a.forma === "modal" && a.modal) { setModal(a.modal); return; }
    router.push(a.rota);
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
            {!pessoal && (
              /* ⚠️ Criar EMPRESA nem aparece aqui. Criar tenant é uma
                 organização inteira — isolamento de dados, membros e cobrança
                 próprios — e desfazer não é apagar uma linha. Ela vive em
                 Administração, junto do resto que governa a plataforma. */
              <div className="border-t border-border-soft px-5 py-3">
                <span className="text-[11px] text-placeholder">
                  Para criar outra empresa (organização separada, com dados e cobrança próprios),
                  vá em Administração → Empresas.
                </span>
              </div>
            )}
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
}: { titulo: string; acoes: Acao[]; onEscolher: (e: React.MouseEvent, a: Acao) => void }) {
  return (
    <div className="py-2">
      <span className="block px-5 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{titulo}</span>
      {acoes.map((a) => (
        // ⚠️ `<Link>`, não `<button>`. Com botão não havia endereço: nem nova
        // aba, nem Ctrl+clique, nem pré-carregamento, nem link para mandar a um
        // colega. Para um sistema usado por várias pessoas ao mesmo tempo, isso
        // custa produtividade todo dia.
        <Link
          key={a.label}
          href={a.rota}
          onClick={(e) => onEscolher(e, a)}
          className="w-full flex items-center gap-3 px-5 py-[9px] text-left hover:bg-surface-2 transition-colors"
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-surface-2 shrink-0">
            <Icon name={a.icon} size={15} color="var(--color-text-secondary)" />
          </span>
          <span className="text-label text-ink truncate flex-1">{a.label}</span>
          {/* Diz, ANTES do clique, se vai abrir aqui ou trocar de tela — é a
              informação que faltava para saber se o contexto se perde. */}
          <span className="text-[11px] text-placeholder shrink-0">
            {a.forma === "modal" ? "aqui" : "abre a tela"}
          </span>
        </Link>
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
