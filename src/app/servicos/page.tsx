"use client";

// Consolidado num hub: esta rota redireciona (deep-link preservado).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Redir() {
  const r = useRouter();
  useEffect(() => { r.replace("/cadastros?aba=servicos"); }, [r]);
  return null;
}
