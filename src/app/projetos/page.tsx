"use client";

// Consolidado num hub (deep-link preservado).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Redir() {
  const r = useRouter();
  useEffect(() => { r.replace("/cadastros?aba=projetos"); }, [r]);
  return null;
}
