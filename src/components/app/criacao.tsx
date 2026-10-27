"use client";

/**
 * A PORTA ÚNICA DE CRIAÇÃO (decisão do dono, 27/10/2026).
 *
 * Toda porta que cria alguma coisa — Criar, o "Novo" do topo, o botão da tela,
 * o menu, o ⌘K, a IA — chama `abrirCriacao(tipo)`. O anfitrião
 * (`CriacaoGlobal`, montado no `AppShell`) desenha SEMPRE o mesmo formulário,
 * em pop-up. Antes, "Nova venda" no Painel de vendas e no "Novo" do topo
 * abriam dois formulários diferentes, que gravavam coisas diferentes.
 *
 * Os formulários que também vivem em página (a nova venda, a nova compra, a
 * nova conta) perguntam `useSaidaDoFormulario()` como sair: no pop-up eles
 * fecham e avisam; na página, navegam como sempre.
 *
 * ⚠️ O pedido feito antes de o anfitrião montar fica na fila (`pendente`), como
 * no `ChatGlobal`: os efeitos do React rodam do filho para o pai.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TITULO_CRIACAO, type TipoCriacao } from "@/core/criar";
import type { CadastroNoCampo } from "@/components/ui/Select";

export const EVENTO_CRIACAO = "a4p:criar-item";
/** Avisa as telas de que um item foi criado (para recarregar o que leem do navegador). */
export const EVENTO_CRIADO = "a4p:item-criado";

export interface PedidoCriacao {
  tipo: TipoCriacao;
  /** Chamado com o id do item criado, quando o formulário o conhece. */
  aoCriar?: (id: string | null) => void;
  /**
   * O que o formulário receberia pelo endereço da página (`?entrada=`,
   * `?valor=`…) — a caixa de entrada abre a conta a pagar JÁ preenchida.
   */
  parametros?: Record<string, string>;
}

let ouvindo = false;
let pendente: PedidoCriacao | null = null;

export function abrirCriacao(tipo: TipoCriacao, opcoes: Omit<PedidoCriacao, "tipo"> = {}): void {
  if (typeof window === "undefined") return;
  const pedido = { tipo, ...opcoes };
  if (!ouvindo) { pendente = pedido; return; }
  window.dispatchEvent(new CustomEvent<PedidoCriacao>(EVENTO_CRIACAO, { detail: pedido }));
}

/**
 * O "+ Cadastrar novo X" de um campo de escolha (`Select`/`SelectBusca`
 * `cadastrar`). Abre o MESMO pop-up da porta única, por cima do formulário, e
 * o item criado volta selecionado no campo.
 */
export function cadastroDe(tipo: TipoCriacao, parametros?: Record<string, string>): CadastroNoCampo {
  const titulo = TITULO_CRIACAO[tipo];
  return {
    rotulo: `Cadastrar ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}`,
    abrir: (escolher) => abrirCriacao(tipo, { parametros, aoCriar: (id) => { if (id) escolher(id); } }),
  };
}

/** Uso interno do anfitrião. */
export function ouvirCriacao(abrir: (p: PedidoCriacao) => void): () => void {
  const ouvir = (e: Event) => { const d = (e as CustomEvent<PedidoCriacao>).detail; if (d) abrir(d); };
  window.addEventListener(EVENTO_CRIACAO, ouvir);
  ouvindo = true;
  if (pendente) { abrir(pendente); pendente = null; }
  return () => { window.removeEventListener(EVENTO_CRIACAO, ouvir); ouvindo = false; };
}

export function avisarCriado(tipo: TipoCriacao, id: string | null = null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_CRIADO, { detail: { tipo, id } }));
}

/** Recarrega algo quando um item do tipo pedido é criado em qualquer porta. */
export function useAoCriar(tipos: TipoCriacao[], fazer: () => void): void {
  const ref = React.useRef(fazer);
  ref.current = fazer;
  const chave = tipos.join("|");
  React.useEffect(() => {
    const lista = chave.split("|");
    const ouvir = (e: Event) => {
      const t = (e as CustomEvent<{ tipo: string }>).detail?.tipo;
      if (t && lista.includes(t)) ref.current();
    };
    window.addEventListener(EVENTO_CRIADO, ouvir);
    return () => window.removeEventListener(EVENTO_CRIADO, ouvir);
  }, [chave]);
}

/* ------------------------- o contexto do pop-up ------------------------- */

interface Janela {
  fechar: () => void;
  avisar: (msg: string) => void;
  criado: (id: string | null) => void;
  parametros?: Record<string, string>;
}
const ContextoJanela = React.createContext<Janela | null>(null);
export const ProvedorJanela = ContextoJanela.Provider;

/**
 * Como um formulário de documento sai: no pop-up fecha e avisa; na página
 * navega. `concluir(msg, destino)` — o destino só vale na página.
 */
export function useSaidaDoFormulario() {
  const janela = React.useContext(ContextoJanela);
  const router = useRouter();
  return React.useMemo(() => ({
    naJanela: janela !== null,
    concluir(msg: string, destinoNaPagina?: string, id: string | null = null) {
      if (janela) { janela.criado(id); janela.avisar(msg); janela.fechar(); return; }
      if (destinoNaPagina) router.push(destinoNaPagina);
    },
    cancelar() {
      if (janela) { janela.fechar(); return; }
      router.back();
    },
  }), [janela, router]);
}

/**
 * Os parâmetros do endereço. No pop-up são os do PEDIDO, nunca os da tela de
 * baixo: o `?id=` dela não é deste formulário, e lê-lo abriria uma edição por
 * engano.
 */
export function useParametrosDoFormulario(): URLSearchParams {
  const janela = React.useContext(ContextoJanela);
  const sp = useSearchParams();
  return React.useMemo(
    () => (janela ? new URLSearchParams(janela.parametros ?? {}) : new URLSearchParams(sp?.toString() ?? "")),
    [janela, sp],
  );
}
