"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { marcarRotaVista } from "@/lib/adoption";

/**
 * Registra centralmente cada rota que o usuário abre (localStorage), para a
 * Jornada de Adesão saber quais telas já foram conhecidas. Sem UI. Montado uma
 * vez no AppShell.
 */
export function RouteTracker() {
  const pathname = usePathname();
  React.useEffect(() => {
    if (pathname) marcarRotaVista(pathname);
  }, [pathname]);
  return null;
}
