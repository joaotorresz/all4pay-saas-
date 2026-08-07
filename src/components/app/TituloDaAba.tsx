"use client";

/**
 * O TÍTULO DA ABA DO NAVEGADOR.
 *
 * ⚠️ Quase todo o sistema anunciava **"all4pay — Tesouraria"**. A causa é
 * estrutural: só o `layout.tsx` declarava `metadata.title`, e as telas, sendo
 * componentes de cliente, não conseguem exportar `metadata`. O `AppShell`
 * recebia o título e o usava apenas no `<h1>`.
 *
 * Montado pelo `AppShell`, então vale para TODAS as telas de uma vez —
 * inclusive as abas de hub, que trocam de conteúdo sem trocar de rota.
 *
 * A regra (grafia da marca, ordem do título) mora em `core/marca`, que é puro
 * e por isso pode ser conferido pela matriz de consistência.
 */
import * as React from "react";
import { tituloDaAba } from "@/core/marca";

export { MARCA, MARCA_IA, tituloDaAba } from "@/core/marca";

export function TituloDaAba({ titulo }: { titulo?: string | null }) {
  React.useEffect(() => {
    document.title = tituloDaAba(titulo);
  }, [titulo]);
  return null;
}
