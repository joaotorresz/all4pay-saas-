import type { Metadata } from "next";
import { CriarContaView } from "@/components/entrada/CriarContaView";

export const metadata: Metadata = {
  title: "Criar conta · all4pay",
  description: "Crie a sua conta em três campos e comece a usar o all4pay.",
};

export default function CriarContaPage() {
  return <CriarContaView />;
}
