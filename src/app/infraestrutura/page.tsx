"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// infraestrutura virou uma aba de /plataforma (hub único de arquitetura/infra/orquestração).
export default function InfraestruturaRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/plataforma?aba=infraestrutura"); }, [router]);
  return null;
}
