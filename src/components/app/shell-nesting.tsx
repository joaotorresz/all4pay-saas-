"use client";

import * as React from "react";

/**
 * Detecção de AppShell aninhado.
 *
 * Um hub (ex.: `/contabilidade`) renderiza telas inteiras como abas, e cada
 * uma traz o seu próprio `AppShell`. Sem isso, sidebar e header apareceriam
 * duas vezes. Com isso, o AppShell de dentro vira passthrough — e nenhuma das
 * ~20 telas precisou ser reescrita para virar aba.
 *
 * Vive num módulo client porque `AppShell` é server component (não pode criar
 * nem ler contexto). O AppShell monta o "chrome" completo e entrega aqui; este
 * gate decide se pinta o chrome ou só o conteúdo.
 */
const DentroDoShell = React.createContext(false);

export function ShellGate({
  chrome,
  actions,
  children,
}: {
  /** O layout completo (sidebar + header + conteúdo) já montado. */
  chrome: React.ReactNode;
  /**
   * Ações do header da tela ("Novo produto", "Nova venda"). Aninhado, o header
   * some junto com o chrome — mas as ações NÃO podem sumir, senão a aba fica
   * sem o botão que cria o registro. Elas reaparecem acima do conteúdo.
   */
  actions?: React.ReactNode;
  /** Só o conteúdo — usado quando já existe um AppShell acima. */
  children: React.ReactNode;
}) {
  const aninhado = React.useContext(DentroDoShell);
  if (aninhado) {
    return (
      <>
        {actions && <div className="flex items-center justify-end gap-2 flex-wrap -mt-1">{actions}</div>}
        {children}
      </>
    );
  }
  return <DentroDoShell.Provider value={true}>{chrome}</DentroDoShell.Provider>;
}
