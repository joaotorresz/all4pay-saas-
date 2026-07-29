"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// "A pagar" foi unificado em Pagar (aba Títulos).
export default function PagaveisPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/pagamentos"); }, [router]);
  return null;
}
