"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// arquitetura virou uma aba de /plataforma (hub único de arquitetura/infra/orquestração).
export default function ArquiteturaRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/plataforma?aba=arquitetura"); }, [router]);
  return null;
}
