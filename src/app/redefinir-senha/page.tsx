import type { Metadata } from "next";
import { RedefinirSenhaView } from "@/components/entrada/RedefinirSenhaView";
import { MARCA } from "@/core/marca";

export const metadata: Metadata = {
  title: `Nova senha · ${MARCA}`,
  description: "Escolha a nova senha da sua conta.",
};

export default function RedefinirSenhaPage() {
  return <RedefinirSenhaView />;
}
