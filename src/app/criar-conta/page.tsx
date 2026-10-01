import type { Metadata } from "next";
import { CriarContaView } from "@/components/entrada/CriarContaView";

export const metadata: Metadata = {
  title: "Criar conta · Quattro",
  description: "Crie a sua conta em três campos e comece a usar o Quattro.",
};

export default function CriarContaPage() {
  return <CriarContaView />;
}
