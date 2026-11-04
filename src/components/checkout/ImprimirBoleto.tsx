"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { imprimirRelatorio } from "@/lib/imprimir";

/**
 * O botão "Imprimir" da página do boleto. Com `automatico` (o "Imprimir" da
 * fatura abre `?imprimir=1`), a janela de impressão abre sozinha uma vez,
 * depois que a página pintou.
 */
export function ImprimirBoleto({ automatico = false }: { automatico?: boolean }) {
  React.useEffect(() => {
    if (!automatico) return;
    const t = window.setTimeout(imprimirRelatorio, 300);
    return () => window.clearTimeout(t);
  }, [automatico]);
  return (
    <div data-nao-imprime className="flex justify-end">
      <Button variant="primary" onClick={imprimirRelatorio}>Imprimir</Button>
    </div>
  );
}
