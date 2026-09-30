"use client";

import * as React from "react";

/**
 * Escopo em que os valores aparecem SEM CENTAVOS (a Visão geral).
 *
 * ⚠️ Esconder os centavos por CSS (`.a4p-sem-centavos [data-cents]`) TRUNCAVA
 * o valor: R$ 3.210,99 aparecia "3.210", R$ 0,99 aparecia "R$0". Um pagamento
 * de R$ 3.210,99 fazia o saldo da Home cair 3.211 numa leitura e 3.210 na
 * outra, conforme os centavos dos dois lados. Achado pelo teste de jornada.
 * Dentro deste escopo o `<BRL>` ARREDONDA ao real inteiro antes de mostrar.
 */
export const SemCentavosCtx = React.createContext(false);

export function SemCentavos({ children }: { children: React.ReactNode }) {
  return <SemCentavosCtx.Provider value={true}>{children}</SemCentavosCtx.Provider>;
}
