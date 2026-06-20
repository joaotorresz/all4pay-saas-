"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Console unificado em abas no Copiloto (/copiloto?aba=autonomo).
export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/copiloto?aba=autonomo"); }, [router]);
  return null;
}
