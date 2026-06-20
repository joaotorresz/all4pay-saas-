"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// "A receber" foi unificado em Receber (aba Títulos).
export default function RecebiveisPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/recebimentos?aba=titulos"); }, [router]);
  return null;
}
