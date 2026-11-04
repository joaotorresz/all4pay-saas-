"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { esperaDaConsulta, pedeRedesenhar } from "@/core/cobranca/acompanhar";

/**
 * A FATURA SE ATUALIZA SOZINHA (04/11/2026): enquanto o link está em aberto,
 * a página pergunta ao servidor se o pagamento entrou
 * (`/api/pinbank/checkout/situacao`) e, quando o banco confirma, redesenha a
 * fatura como paga — sem o cliente recarregar.
 *
 * Não desenha nada além do aviso para leitores de tela. A aba escondida não
 * pergunta; ao voltar, pergunta na hora.
 */
export function AcompanharPagamento({ token, situacao }: { token: string; situacao: string }) {
  const router = useRouter();
  const [aviso, setAviso] = React.useState("");

  React.useEffect(() => {
    if (situacao !== "aberto") return;
    let n = 0;
    let parado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inicio = Date.now();

    const consultar = async () => {
      if (parado) return;
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch(`/api/pinbank/checkout/situacao?t=${encodeURIComponent(token)}`, { cache: "no-store" });
          const j = (await r.json().catch(() => null)) as { situacao?: unknown } | null;
          if (pedeRedesenhar(situacao, j?.situacao)) {
            parado = true;
            if (j?.situacao === "pago") setAviso("Pagamento confirmado.");
            router.refresh();
            return;
          }
        } catch {
          // Sem conexão agora: tenta de novo no próximo intervalo.
        }
      }
      agendar();
    };
    const agendar = () => {
      const espera = esperaDaConsulta(n++, Date.now() - inicio);
      if (espera === null || parado) return;
      timer = setTimeout(() => void consultar(), espera);
    };
    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || parado) return;
      if (timer) clearTimeout(timer);
      void consultar();
    };

    agendar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      parado = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [token, situacao, router]);

  return <span className="sr-only" role="status" aria-live="polite">{aviso}</span>;
}
