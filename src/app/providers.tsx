"use client";

import * as React from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** App-wide React Query provider. One client per browser session. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        // Visibilidade de falha por widget: sem isso, um erro num accessor vira
        // um estado de erro silencioso — logamos a query e a causa no console.
        queryCache: new QueryCache({
          onError: (error, query) => {
            console.error("[a4p] query falhou:", query.queryKey, error);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
