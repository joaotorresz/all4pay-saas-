import { Suspense } from "react";
import { PlanosView } from "@/components/planos/PlanosView";

export default function Page() {
  // `useSearchParams` (o `?de=` que o middleware anexa) exige Suspense no App
  // Router — sem ele o build estático falha.
  return (
    <Suspense fallback={null}>
      <PlanosView />
    </Suspense>
  );
}
