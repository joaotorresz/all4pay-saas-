"use client";

// Consolidado no hub de Contabilidade (deep-link preservado).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Redir() {
  const r = useRouter();
  useEffect(() => { r.replace("/contabilidade?aba=plano-de-contas"); }, [r]);
  return null;
}
