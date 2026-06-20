"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Console unificado em abas no Copiloto (/copiloto?aba=quant).
export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/copiloto?aba=quant"); }, [router]);
  return null;
}
