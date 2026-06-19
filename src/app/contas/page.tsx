"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// O Open Finance foi unificado na esteira "Entrada de dados" (aba Conectar).
export default function ContasPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/upload?aba=conectar"); }, [router]);
  return null;
}
