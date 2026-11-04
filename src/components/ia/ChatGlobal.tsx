"use client";

/**
 * A PORTA ÚNICA DA QUATTRO AI (decisão do dono, 14/10/2026): o chat em tela
 * cheia abre por cima de QUALQUER tela — pelo item "Quattro AI" do menu, pelo
 * ⌘K e pela caixa da Home. O botão flutuante "4" e o painel lateral que ele
 * abria saíram; a aba "Conversa" de `/quattro-ai` também. Uma IA, um lugar.
 *
 * Quem quer abrir chama `abrirChat({...})`, que dispara `a4p:open-ia`. O
 * anfitrião (`ChatGlobal`, montado no `AppShell`) ouve e monta o
 * `ChatTelaCheia`.
 *
 * ⚠️ A abertura pedida ANTES de o anfitrião montar fica na fila
 * (`pendente`): os efeitos do React rodam do filho para o pai e entre irmãos
 * na ordem da árvore, então uma tela que pede o chat ao montar dispararia o
 * evento sem ninguém ouvindo — e o pedido sumiria calado.
 */
import * as React from "react";
import { ChatTelaCheia, type AjusteChat, type SugestaoChat, type TelaChat } from "./ChatTelaCheia";
import { lerLinkDeLancamento, semLinkDeLancamento } from "@/core/whatsapp/lancar";
import { isDemo } from "@/lib/demo";

export const EVENTO_CHAT = "a4p:open-ia";

export interface AbrirChat {
  /** A primeira pergunta. Sem ela o chat abre na saudação. */
  pergunta?: string;
  /** "Veja tudo o que eu faço". Sem elas, as sugestões aprendidas da IA. */
  sugestoes?: SugestaoChat[];
  /** Conta o clique numa sugestão (a Home soma o peso do chip). */
  aoClicarSugestao?: (id: string) => void;
  /** "Ajustar prioridades" da Home: a conversa arruma a Home em vez de responder números. */
  ajuste?: AjusteChat;
  /** "Pergunte à Quattro AI" do rodapé: a conversa abre no assunto da tela. */
  tela?: TelaChat;
  /** Uma conversa do histórico (a lista do menu lateral): abre já carregada. */
  conversa?: string;
  /** "Vamos completar seu cadastro" (Primeiros passos): a conversa do cadastro. */
  completar?: boolean;
}

let ouvindo = false;
let pendente: AbrirChat | null = null;

export function abrirChat(opcoes: AbrirChat = {}): void {
  if (typeof window === "undefined") return;
  if (!ouvindo) { pendente = opcoes; return; }
  window.dispatchEvent(new CustomEvent<AbrirChat>(EVENTO_CHAT, { detail: opcoes }));
}

export function ChatGlobal() {
  const [aberto, setAberto] = React.useState<(AbrirChat & { n: number }) | null>(null);

  React.useEffect(() => {
    const abrir = (o: AbrirChat) => setAberto((a) => ({ ...o, n: (a?.n ?? 0) + 1 }));
    const ouvir = (e: Event) => abrir((e as CustomEvent<AbrirChat | null>).detail ?? {});
    window.addEventListener(EVENTO_CHAT, ouvir);
    ouvindo = true;
    if (pendente) { abrir(pendente); pendente = null; }
    return () => { window.removeEventListener(EVENTO_CHAT, ouvir); ouvindo = false; };
  }, []);

  // O link do WhatsApp ("paguei 100 de gasolina", etapa 5): abre o chat com a
  // proposta, que só grava pelo "Confirmar". ⚠️ Só na empresa da conversa:
  // aberta outra, o app troca para ela antes (a troca recarrega a página com o
  // mesmo link); sem vínculo com ela, nada abre.
  React.useEffect(() => {
    const link = lerLinkDeLancamento(window.location.search);
    if (!link) return;
    let vivo = true;
    void (async () => {
      const limpar = () => window.history.replaceState(null, "", semLinkDeLancamento(window.location.href));
      if (isDemo) { limpar(); abrirChat({ pergunta: link.frase }); return; }
      const { listarMinhasOrganizacoes, trocarOrganizacao } = await import("@/lib/seguranca");
      const orgs = await listarMinhasOrganizacoes();
      if (!vivo) return;
      const alvo = orgs.find((o) => o.orgId === link.empresa);
      if (!alvo) { limpar(); return; }
      if (!alvo.ativa) {
        try { await trocarOrganizacao(alvo.orgId); } catch (e) { console.error("lancar-whatsapp", e); limpar(); }
        return;
      }
      limpar();
      abrirChat({ pergunta: link.frase });
    })();
    return () => { vivo = false; };
  }, []);

  if (!aberto) return null;
  return (
    <ChatTelaCheia
      key={aberto.n}
      pergunta={aberto.pergunta}
      sugestoes={aberto.sugestoes}
      aoClicarSugestao={aberto.aoClicarSugestao}
      ajuste={aberto.ajuste}
      tela={aberto.tela}
      conversa={aberto.conversa}
      completar={aberto.completar}
      aoFechar={() => setAberto(null)}
    />
  );
}
