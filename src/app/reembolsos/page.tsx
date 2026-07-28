"use client";

// Consolidado no hub (deep-link preservado).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Redir() {
  const r = useRouter();
  useEffect(() => { r.replace("/pagamentos?aba=reembolsos"); }, [r]);
  return null;
}
