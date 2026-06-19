"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A conciliação foi unificada na esteira "Entrada de dados" (aba Conciliar).
export default function ConciliacaoPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/upload?aba=conciliar"); }, [router]);
  return null;
}
