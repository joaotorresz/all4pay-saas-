"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/**
 * "Gerar Pix com o valor de hoje" na fatura vencida (Pix atualizado, 30/10/2026).
 * Quem calcula o valor e emite é o servidor (`/api/pinbank/checkout/pix`);
 * aqui só se pede e se recarrega a página com o Pix novo.
 */
export function GerarPixDoDia({ token }: { token: string }) {
  const router = useRouter();
  const [estado, setEstado] = React.useState<"parado" | "gerando" | "erro">("parado");
  const [mensagem, setMensagem] = React.useState("");

  const gerar = async () => {
    setEstado("gerando");
    try {
      const resp = await fetch("/api/pinbank/checkout/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const corpo = (await resp.json().catch(() => null)) as { motivo?: string } | null;
      if (!resp.ok) {
        setEstado("erro");
        setMensagem(corpo?.motivo ?? "Não foi possível gerar o Pix agora. Tente de novo em alguns minutos ou pague pelo boleto.");
        return;
      }
      router.refresh();
    } catch {
      setEstado("erro");
      setMensagem("Sem conexão. Tente de novo em alguns minutos ou pague pelo boleto.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-caption text-muted leading-[1.5]">
        Esta fatura venceu. O Pix sai com o valor de hoje, já com a multa e os juros, e vale até 23:59.
      </span>
      {estado === "erro" && <span className="text-caption text-negative" role="alert">{mensagem}</span>}
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => void gerar()} disabled={estado === "gerando"}>
          {estado === "gerando" ? "Gerando Pix…" : "Gerar Pix com o valor de hoje"}
        </Button>
      </div>
    </div>
  );
}
