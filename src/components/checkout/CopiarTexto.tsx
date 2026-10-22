"use client";

import * as React from "react";
import { Button } from "@/components/ui";

/** Copia o Pix ou a linha do boleto na página pública de pagamento. */
export function CopiarTexto({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = React.useState<"ok" | "falhou" | null>(null);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado("ok");
    } catch {
      setCopiado("falhou");
    }
  };
  return (
    <div className="flex items-center justify-end gap-3">
      {copiado && (
        <span className="text-caption text-muted" role="status">
          {copiado === "ok" ? "Copiado." : "Não foi possível copiar. Selecione o texto e copie à mão."}
        </span>
      )}
      <Button variant="primary" onClick={() => void copiar()}>{rotulo}</Button>
    </div>
  );
}
