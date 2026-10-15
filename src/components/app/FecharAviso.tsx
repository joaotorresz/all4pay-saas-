"use client";

/**
 * O "x" dos avisos fixos do topo (amostra e assinatura).
 *
 * ⚠️ **Decisão do dono (14/10/2026): os dois avisos passam a FECHAR — mas só
 * nesta SESSÃO do navegador.** A regra antiga ("aviso que se fecha é aviso que
 * some quando alguém volta em dúvida") continua valendo pela metade que
 * importa: fechar NÃO é para sempre. Quem fecha ganha a tela limpa agora; na
 * próxima sessão, se a causa ainda existir, o aviso volta. Por isso a marca
 * mora no `sessionStorage`, nunca no `localStorage` — este o calaria de vez.
 */
import * as React from "react";
import { Icon } from "@/components/ui";

export function useFechadoNaSessao(chave: string) {
  const [fechado, setFechado] = React.useState(false);
  React.useEffect(() => {
    try { setFechado(sessionStorage.getItem(chave) === "1"); } catch { /* sem armazenamento: o aviso só fica aberto */ }
  }, [chave]);
  const fechar = React.useCallback(() => {
    setFechado(true);
    try { sessionStorage.setItem(chave, "1"); } catch { /* fecha só neste render */ }
  }, [chave]);
  return { fechado, fechar };
}

export function BotaoFecharAviso({ onFechar, rotulo }: { onFechar: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onFechar}
      aria-label={rotulo}
      title="Fechar até a próxima sessão"
      className="inline-flex items-center justify-center w-7 h-7 rounded-pill shrink-0 text-muted hover:text-ink hover:bg-surface-2"
    >
      <Icon name="x" size={16} color="currentColor" />
    </button>
  );
}
