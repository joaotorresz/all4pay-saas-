import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = {
  title: "Criar empresa · all4pay",
  description:
    "Onboarding guiado: dados básicos, perfil, governança, estrutura financeira, importação inteligente, análise da IA (DNA + Maturity Score) e criação automática do ambiente.",
};

export default function ComecarPage() {
  return <OnboardingWizard />;
}
