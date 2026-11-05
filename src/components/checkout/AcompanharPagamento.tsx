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
 * Diz ao cliente que a página se atualiza sozinha (05/11/2026: sem isso, o
 * João recarregou à mão). A aba escondida não pergunta; ao voltar para a aba
 * OU para a janela (o app do banco no computador), pergunta na hora.
 */
export function AcompanharPagamento({ token, situacao }: { token: string; situacao: string }) {
  const router = useRouter();
  const [aviso, setAviso] = React.useState("");

  React.useEffect(() => {
    if (situacao !== "aberto") return;
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
      const espera = esperaDaConsulta(Date.now() - inicio);
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
    window.addEventListener("focus", aoVoltar);
    return () => {
      parado = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [token, situacao, router]);

  return (
    <>
      {situacao === "aberto" && (
        <p className="px-6 text-caption text-muted leading-[1.5]">
          Esta página se atualiza sozinha assim que o pagamento for confirmado. Não é preciso recarregar.
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">{aviso}</span>
    </>
  );
}
