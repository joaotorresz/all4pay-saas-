"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// orquestracao virou uma aba de /plataforma (hub único de arquitetura/infra/orquestração).
export default function OrquestracaoRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/plataforma?aba=orquestracao"); }, [router]);
  return null;
}
