"use client";

// Consolidado no hub (deep-link preservado).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Redir() {
  const r = useRouter();
  useEffect(() => { r.replace("/recebimentos?aba=inadimplencia"); }, [r]);
  return null;
}
