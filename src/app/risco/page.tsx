"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Console unificado em abas no Copiloto (/copiloto?aba=risco).
export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/copiloto?aba=risco"); }, [router]);
  return null;
}
