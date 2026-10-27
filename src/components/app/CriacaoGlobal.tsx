"use client";

/**
 * O ANFITRIÃO DA PORTA ÚNICA DE CRIAÇÃO (decisão do dono, 27/10/2026).
 *
 * Montado uma vez no `AppShell`. Toda porta que cria alguma coisa chama
 * `abrirCriacao(tipo)` (ou é um link para um endereço de criação, que este
 * anfitrião intercepta) e o que aparece é SEMPRE o mesmo formulário, em
 * pop-up, sem sair da tela:
 *
 *  - os DOCUMENTOS (venda, compra, conta a receber/pagar, transferência) abrem
 *    na `Janela` larga, com o formulário COMPLETO da tela de cadastro;
 *  - os CADASTROS abrem no modal do próprio formulário da tela de cadastro.
 *
 * ⚠️ É uma PILHA: o "+" ao lado do campo de cliente, dentro da nova conta a
 * receber, abre o novo cliente POR CIMA — e, salvo, o cliente já volta
 * escolhido (`aoCriar`).
 *
 * ⚠️ No modo Pessoa Física a receita e a despesa abrem o formulário curto
 * (`ReceitaForm`), o mesmo de todas as portas desse modo.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui";
import { TITULO_CRIACAO, tipoDaRota, type TipoCriacao } from "@/core/criar";
import { avisarCriado, ouvirCriacao, ProvedorJanela, type PedidoCriacao } from "@/components/app/criacao";
import { useTipoConta } from "@/components/app/useTipoConta";
import { VendaForm } from "@/components/vendas-nf/VendaForm";
import { CompraForm } from "@/components/compras/CompraForm";
import { TituloForm } from "@/components/movimentacoes/TituloForm";
import { NovaTransferencia } from "@/components/movimentacoes/TransferenciasView";
import { NovaParte } from "@/components/registros/PartesView";
import { NovaContaBancaria } from "@/components/registros/ContasBancariasView";
import { NovaCategoria } from "@/components/registros/PlanoContasView";
import { NovoProjeto, NovoCentro } from "@/components/registros/ProjetosCentrosView";
import { NovoContrato } from "@/components/registros/ContratosView";
import { ReceitaForm } from "@/components/lancamentos/ReceitaForm";
import { ProdutoServicoForm } from "@/components/lancamentos/ProdutoServicoForm";
import { PartyForm } from "@/components/lancamentos/PartyForm";
import { VendaCompraForm } from "@/components/lancamentos/VendaCompraForm";
import { MarcaForm, UnidadeForm } from "@/components/lancamentos/MarcaUnidadeForm";

interface Aberto extends PedidoCriacao { chave: number }

/** Os tipos que abrem na janela larga — os outros trazem o próprio modal. */
const NA_JANELA: ReadonlySet<TipoCriacao> = new Set<TipoCriacao>(["venda", "compra", "receber", "pagar", "transferencia"]);

export function CriacaoGlobal() {
  const { pessoal } = useTipoConta();
  const [pilha, setPilha] = React.useState<Aberto[]>([]);
  const [toast, setToast] = React.useState<string | null>(null);
  const seq = React.useRef(0);

  React.useEffect(() => ouvirCriacao((p) => {
    seq.current += 1;
    const chave = seq.current;
    setPilha((s) => [...s, { ...p, chave }]);
  }), []);

  /**
   * ⚠️ OS ENDEREÇOS DE CRIAÇÃO TAMBÉM ABREM O POP-UP. O menu, o ⌘K, os guias e
   * os atalhos da IA apontam para `/dashboard/sales-invoices/new`,
   * `…/clients?novo=1` e afins; um clique comum neles abre o MESMO pop-up, e
   * Ctrl/⌘/Shift/botão do meio continuam abrindo a página em outra aba (que
   * monta o mesmo formulário). Fase de CAPTURA: roda antes do `<Link>`, que
   * respeita o `preventDefault`.
   */
  React.useEffect(() => {
    const clique = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (a.closest("[data-porta-propria]")) return; // a porta já chama `abrirCriacao`
      if (a.origin !== window.location.origin) return;
      const href = a.getAttribute("href") ?? "";
      const tipo = tipoDaRota(href);
      if (!tipo) return;
      e.preventDefault();
      // O que o link levaria à página (`?valor=`…) vai junto; `novo` é só a marca.
      const parametros = Object.fromEntries(new URL(href, window.location.origin).searchParams);
      delete parametros.novo;
      seq.current += 1;
      const chave = seq.current;
      setPilha((s) => [...s, { tipo, chave, parametros }]);
    };
    document.addEventListener("click", clique, true);
    return () => document.removeEventListener("click", clique, true);
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const fechar = React.useCallback((chave: number) => setPilha((s) => s.filter((p) => p.chave !== chave)), []);

  return (
    <>
      {/* ⚠️ Num portal no `<body>`: montados dentro do `AppShell`, os modais de
          cadastro (z-50) ficavam presos ao contexto de empilhamento dele e
          abriam POR BAIXO da janela larga (portal, z-[45]) — o "+ Cadastrar
          novo cliente" da venda parecia não fazer nada. */}
      {typeof document !== "undefined" && pilha.length > 0 && createPortal(
        <>
          {pilha.map((p, i) => (
            <ItemDaPilha
              key={p.chave}
              pedido={p}
              topo={i === pilha.length - 1}
              pessoal={pessoal}
              fechar={() => fechar(p.chave)}
              avisar={setToast}
            />
          ))}
        </>,
        document.body,
      )}
      {toast && typeof document !== "undefined" && createPortal(
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink text-white text-[17px] font-medium px-4 py-[11px] rounded-md shadow-popover z-[80]">
          <Icon name="check" size={15} color="var(--color-lime)" />
          <span>{toast}</span>
        </div>,
        document.body,
      )}
    </>
  );
}

function ItemDaPilha({ pedido, topo, pessoal, fechar, avisar }: {
  pedido: Aberto; topo: boolean; pessoal: boolean;
  fechar: () => void; avisar: (m: string) => void;
}) {
  const { tipo } = pedido;
  const qc = useQueryClient();
  // ⚠️ Recarrega as listas ANTES de devolver o id: o campo que pediu o
  // cadastro só mostra o item escolhido quando ele já está nas opções.
  const criado = React.useCallback((id: string | null) => {
    void qc.invalidateQueries().catch(() => undefined).finally(() => {
      pedido.aoCriar?.(id);
      avisarCriado(tipo, id);
    });
  }, [pedido, tipo, qc]);
  const janela = React.useMemo(
    () => ({ fechar, avisar, criado, parametros: pedido.parametros }),
    [fechar, avisar, criado, pedido.parametros],
  );
  /** Fim de um cadastro: devolve o id a quem pediu, avisa e fecha. */
  const concluir = (id: string | null, msg: string) => { criado(id); avisar(msg); fechar(); };
  /** Os formulários antigos avisam pelo toast e fecham sozinhos; o aviso também marca a criação. */
  const p = {
    onClose: fechar,
    onToast: (m: string) => { avisar(m); if (/salv|criad/i.test(m) && !/erro|não foi/i.test(m)) criado(null); },
  };

  if (pessoal && (tipo === "receber" || tipo === "pagar")) {
    return <ReceitaForm kind={tipo === "receber" ? "receita" : "despesa"} titulo={tipo === "receber" ? "Nova receita" : "Nova despesa"} {...p} />;
  }

  if (NA_JANELA.has(tipo)) {
    return (
      <ProvedorJanela value={janela}>
        <Janela titulo={TITULO_CRIACAO[tipo]} topo={topo} onClose={fechar}>
          <React.Suspense fallback={null}>
            {tipo === "venda" && <VendaForm />}
            {tipo === "compra" && <CompraForm />}
            {tipo === "receber" && <TituloForm direcao="receber" />}
            {tipo === "pagar" && <TituloForm direcao="pagar" />}
            {tipo === "transferencia" && <NovaTransferencia onClose={fechar} onCriado={concluir} />}
          </React.Suspense>
        </Janela>
      </ProvedorJanela>
    );
  }

  switch (tipo) {
    case "cliente": return <NovaParte lado="cliente" onClose={fechar} onCriado={concluir} />;
    case "fornecedor": return <NovaParte lado="fornecedor" onClose={fechar} onCriado={concluir} />;
    case "conta-bancaria": return <NovaContaBancaria onClose={fechar} onCriado={concluir} />;
    case "categoria": return <NovaCategoria natureza={pedido.parametros?.natureza === "receita" ? "receita" : "despesa"} onClose={fechar} onCriado={concluir} />;
    case "projeto": return <NovoProjeto onClose={fechar} onCriado={concluir} />;
    case "centro": return <NovoCentro onClose={fechar} onCriado={concluir} />;
    case "contrato-cliente": return <NovoContrato lado="cliente" onClose={fechar} onCriado={concluir} />;
    case "contrato-fornecedor": return <NovoContrato lado="fornecedor" onClose={fechar} onCriado={concluir} />;
    case "produto": return <ProdutoServicoForm kind="produto" onClose={fechar} onToast={avisar} onCriado={criado} />;
    case "servico": return <ProdutoServicoForm kind="servico" onClose={fechar} onToast={avisar} onCriado={criado} />;
    case "orcamento-venda": return <VendaCompraForm docKind="orcamento" itemKind="produto" {...p} />;
    case "transportadora": return <PartyForm role="carrier" {...p} />;
    case "marca": return <MarcaForm {...p} />;
    case "unidade": return <UnidadeForm {...p} />;
    default: return null;
  }
}

/**
 * A janela larga dos documentos: o formulário completo da tela, por cima da
 * tela onde a pessoa está. Fundo da página dentro (os cartões do formulário
 * são brancos), título fixo no alto, corpo que rola. Esc e o "x" fecham.
 *
 * ⚠️ z-[45]: abaixo do modal de cadastro (z-50), que é o que o "+" de um campo
 * abre POR CIMA dela. Só a janela do TOPO responde ao Esc.
 */
function Janela({ titulo, topo, onClose, children }: {
  titulo: string; topo: boolean; onClose: () => void; children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!topo) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [topo, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[45] bg-black/30 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-[min(1040px,100%)] my-auto max-h-[94vh] flex flex-col rounded-card bg-surface-1 shadow-popover overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-white border-b border-border-soft">
          <span className="text-h3 font-medium">{titulo}</span>
          <button onClick={onClose} aria-label="Fechar" className="inline-flex p-1 rounded-md hover:bg-surface-2">
            <Icon name="x" size={18} color="var(--color-text-secondary)" />
          </button>
        </div>
        <div data-fundo-cinza className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
