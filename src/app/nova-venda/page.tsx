"use client";

// Consolidado no hub de Vendas e NFs (deep-link preservado).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Redir() {
  const r = useRouter();
  useEffect(() => { r.replace("/vendas?aba=nova"); }, [r]);
  return null;
}
